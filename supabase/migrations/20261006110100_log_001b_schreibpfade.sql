-- =============================================================================
-- LOG-EPIC-001, PR (b): Schreibpfade ohne Auditeintrag (ANN-230)
--
-- Jede Funktion unten ist die bisherige Fassung ohne den Eintrag ins
-- Auditlog. Was sie schreibt, weisen ihre Zeilen selbst nach (created_by,
-- updated_by, finalized_by, issued_by, cancelled_by, completed_by,
-- no_show_recorded_by, fee_waived_by, voided_by, removed_by, closed_by,
-- done_by, placed_by/released_by, merged_by, recorded_by, published_by,
-- changed_by, treatment_note_versions). Zusaetzlich:
--
--   * reopen_appointment setzt reopened_at/reopened_by.
--   * redeem_platform_invitation protokolliert nur die Aktivierung, nicht das
--     neue Kennwort; platform_invitation_mail den Versand nicht (sent_at).
--   * app.log_platform_access_event legt die Akte in den Kontext, damit
--     Auskunft und Legal Hold den Eintrag finden.
--   * invite_platform_representation vermerkt den Zweifel an der
--     Einwilligungsfaehigkeit am Zugang (p_capacity_doubt);
--     note_companion_capacity_doubt entfaellt.
--   * delete_due_platform_accesses haelt einen Zugang mit diesem Vermerk so
--     lange wie die Akte bzw. das Trainingsverhaeltnis.
--   * export_patient_record nimmt in die Zugriffe nur erfolgreiche auf.
--   * Entzuege im Loeschlauf und bei der Wiederanwendung zaehlt
--     retention.applied; sie stehen nicht mehr einzeln im Log.
-- =============================================================================

CREATE OR REPLACE FUNCTION app.close_waitlist_entry(p_org uuid, p_actor uuid, p_entry_id uuid, p_outcome text, p_appointment_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_eintrag public.waitlist_entries;
begin
  select * into v_eintrag
  from public.waitlist_entries w
  where w.id = p_entry_id and w.organization_id = p_org
  for update;
  if not found then
    raise exception 'waitlist entry not found' using errcode = 'P0002';
  end if;
  if v_eintrag.status <> 'open' then
    raise exception 'waitlist entry closed' using errcode = '22023';
  end if;

  if p_outcome = 'placed' then
    if p_appointment_id is null or not exists (
      select 1 from public.appointments a
      where a.id = p_appointment_id
        and a.organization_id = p_org
        and a.patient_id = v_eintrag.patient_id
        and a.kind = 'therapy'
        and a.status <> 'cancelled'
    ) then
      raise exception 'appointment not found' using errcode = 'P0002';
    end if;
  elsif p_outcome = 'withdrawn' then
    if p_appointment_id is not null then
      raise exception 'withdrawn entry takes no appointment' using errcode = '22023';
    end if;
  else
    raise exception 'invalid outcome' using errcode = '22023';
  end if;

  update public.waitlist_entries w
     set status                = p_outcome,
         placed_appointment_id = p_appointment_id,
         closed_at             = clock_timestamp(),
         closed_by             = p_actor,
         updated_at            = clock_timestamp(),
         updated_by            = p_actor
   where w.id = p_entry_id;

end;
$function$;

CREATE OR REPLACE FUNCTION app.delete_due_patient_photos(p_organization_id uuid, p_patient_id uuid, p_run_id uuid, p_actor uuid, p_reason text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_anzahl integer;
begin
  -- Ein Befehl mit datenveraendernden Teilausdruecken: Auswahl, Sperre,
  -- Loeschen und Journal sehen dieselbe Menge. Der Trigger an
  -- patient_files schreibt je Zeile den Loeschauftrag fuer das Objekt.
  --
  -- Auch Zeilen im Zustand pending: Ein Widerruf trifft ein Foto, dessen
  -- Upload noch laeuft (Aufnahme = created_at). Ohne SKIP LOCKED: Ein Foto,
  -- das gerade bestaetigt wird, wird nicht uebergangen, sondern nach der
  -- Bestaetigung geloescht.
  with kandidaten as (
    select f.id,
           f.patient_id,
           f.photo_locked_at,
           app.patient_photo_due_at(f.patient_id, f.created_at, f.photo_locked_at) as due_at,
           app.under_legal_hold(p_organization_id, 'patient', f.patient_id) as gehalten
    from public.patient_files f
    where f.organization_id = p_organization_id
      and f.document_type = 'patientenfoto'
      and (p_patient_id is null or f.patient_id = p_patient_id)
    for update of f
  ),
  faellig as (
    select k.id, k.patient_id, k.photo_locked_at, k.due_at, k.gehalten
    from kandidaten k
    where k.due_at <= now()
  ),
  -- Einmal faellig bleibt faellig: Der Hold haelt die Loeschung an, nicht die
  -- Sperre.
  gesperrt as (
    update public.patient_files f
       set photo_locked_at = x.due_at
      from faellig x
     where f.id = x.id
       and x.gehalten
       and x.photo_locked_at is null
    returning f.id
  ),
  zu_loeschen as (
    select x.id, x.patient_id, x.due_at from faellig x where not x.gehalten
  ),
  geloescht as (
    delete from public.patient_files f
    using zu_loeschen x
    where f.id = x.id
    returning f.id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select p_organization_id, p_run_id, 'patient_files', g.id, 'patientenfoto', x.due_at
  from geloescht g
  join zu_loeschen x on x.id = g.id;
  get diagnostics v_anzahl = row_count;

  return v_anzahl;
end;
$function$;

CREATE OR REPLACE FUNCTION app.delete_due_platform_accesses(p_org uuid, p_run uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_anzahl integer;
begin
  with faellig as (
    select a.id, a.organization_id,
           app.platform_access_ended_at(a.id) + app.retention_interval('plattformzugang') as due_at,
           -- LOG-EPIC-001: Ein Zugang mit Zweifel-Vermerk (ADR-023 Punkt 13)
           -- bleibt so lange wie die Akte bzw. das Verhaeltnis; deren
           -- Loeschung setzt die Verweise auf null.
           a.companion_declined_at is null
             or (a.patient_id is null and a.training_relationship_id is null) as frei
    from public.platform_accesses a
    where a.organization_id = p_org
  ),
  geloescht as (
    delete from public.platform_accesses a
    using faellig f
    where a.id = f.id
      and f.due_at is not null
      and f.due_at <= now()
      and f.frei
    returning a.id, a.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run, 'platform_accesses', g.id, 'plattformzugang', f.due_at
  from geloescht g
  join faellig f on f.id = g.id;
  get diagnostics v_anzahl = row_count;
  return v_anzahl;
end;
$function$;

CREATE OR REPLACE FUNCTION app.delete_due_platform_accounts(p_org uuid, p_run uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_konto  record;
  v_anzahl integer := 0;
begin
  for v_konto in
    select a.account_user_id as id,
           max(app.platform_access_ended_at(a.id)) as ended_at
    from public.platform_accesses a
    where a.organization_id = p_org
      and a.account_user_id is not null
      and exists (select 1 from auth.users u where u.id = a.account_user_id)
      and not exists (select 1 from public.user_profiles up where up.id = a.account_user_id)
      -- Zweitreview B2: Ein Konto mit offenem Auftrag zaehlt nicht bei jedem
      -- Lauf neu.
      and not exists (
        select 1 from public.platform_account_deletions d where d.account_user_id = a.account_user_id
      )
    group by a.account_user_id
    -- Jeder Zugang des Kontos ist beendet, auch in anderen Organisationen.
    having bool_and(app.platform_access_ended_at(a.id) is not null)
       and not exists (
         select 1 from public.platform_accesses b
         where b.account_user_id = a.account_user_id
           and b.organization_id <> p_org
           and app.platform_access_ended_at(b.id) is null
       )
       and max(app.platform_access_ended_at(a.id)) + app.platform_read_period() <= now()
  loop
    -- Den Entzug zaehlt retention.applied (LOG-EPIC-001).
    update public.platform_accesses a
       set status = 'revoked',
           revoked_at = app.platform_access_ended_at(a.id),
           revoked_by = null,
           revoked_reason = 'account_deleted',
           locked_at = null,
           locked_by = null
     where a.account_user_id = v_konto.id and a.status <> 'revoked';

    -- ABN-011 (BEF-115): Geloescht wird ueber die Admin-API des
    -- Anmeldedienstes, nicht per SQL. Der Lauf gibt den Auftrag; der
    -- Zugangsdienst fuehrt ihn aus und bestaetigt, erst dann steht das Konto
    -- im Loeschjournal.
    perform app.order_platform_account_deletion(
      v_konto.id, p_org, p_run, v_konto.ended_at + app.platform_read_period(), 'retention');
    v_anzahl := v_anzahl + 1;
  end loop;

  -- Zweitreview: Ein Konto, das der Zugangsdienst angelegt hat und das nie
  -- gebunden wurde (Einloesen abgebrochen, Aufraeumen gescheitert), traegt
  -- die Marke `platform_account` in den Metadaten des Anmeldedienstes und
  -- faellt 30 Tage nach dem Anlegen. Praxiskonten tragen sie nie. Der Lauf
  -- einer Organisation raeumt nur, wenn er der erste ist: Das Konto gehoert
  -- keiner Organisation, jede Organisation saehe es gleich.
  if p_org = (select min(o.id::text)::uuid from public.organizations o) then
    for v_konto in
      select u.id, u.created_at
      from auth.users u
      where coalesce(u.raw_app_meta_data ->> 'platform_account', '') = 'true'
        and u.created_at + app.platform_read_period() <= now()
        and not exists (select 1 from public.user_profiles up where up.id = u.id)
        and not exists (select 1 from public.platform_accesses a where a.account_user_id = u.id)
        and not exists (select 1 from public.platform_account_deletions d where d.account_user_id = u.id)
    loop
      perform app.order_platform_account_deletion(
        v_konto.id, p_org, p_run, v_konto.created_at + app.platform_read_period(), 'unbound');
      v_anzahl := v_anzahl + 1;
    end loop;
  end if;
  return v_anzahl;
end;
$function$;

CREATE OR REPLACE FUNCTION app.log_platform_access_event(p_org uuid, p_actor uuid, p_actor_kind text, p_action text, p_access_id uuid, p_context jsonb)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  -- LOG-EPIC-001: Die Akte steht im Kontext, damit Auskunft (Art. 15) und
  -- Legal Hold den Eintrag finden; im Training bleibt sie leer.
  insert into public.audit_log (
    organization_id, actor_user_id, actor_kind, action, subject_type, subject_id, outcome, context
  )
  select p_org, p_actor, p_actor_kind, p_action, 'platform_access', p_access_id, 'success',
         coalesce(p_context, '{}'::jsonb)
           || case when a.patient_id is null then '{}'::jsonb
                   else jsonb_build_object('patient_id', a.patient_id) end
  from (select (select x.patient_id from public.platform_accesses x where x.id = p_access_id) as patient_id) a
$function$;

CREATE OR REPLACE FUNCTION app.mark_appointment_documented(p_appointment_id uuid, p_actor uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_termin record;
begin
  update public.appointments a
     set status       = 'documented',
         -- Der Termin durchlaeuft den Abschluss mit, falls ihn niemand
         -- ausdruecklich abgeschlossen hat (ANN-036). completed_by bleibt
         -- leer - es hat niemand abgeschlossen.
         completed_at = coalesce(a.completed_at, now()),
         updated_at   = now()
   where a.id = p_appointment_id
     and a.status in ('confirmed', 'completed')
  returning a.organization_id, a.patient_id, a.staff_member_id, a.kind, a.training_relationship_id
    into v_termin;

  if not found then
    return false;
  end if;


  return true;
end;
$function$;

CREATE OR REPLACE FUNCTION app.set_training_basis_status(p_basis_id uuid, p_status text, p_action text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor  uuid;
  v_org    uuid;
  v_alt    record;
begin
  v_actor := auth.uid();
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to manage training bases' using errcode = '42501';
  end if;

  select b.id, b.status, b.training_relationship_id, t.status as relationship_status
    into v_alt
  from public.training_bases b
  join public.training_relationships t on t.id = b.training_relationship_id
  where b.id = p_basis_id
    and b.organization_id = v_org
  for update of b;

  if not found then
    raise exception 'training basis not found' using errcode = 'P0002';
  end if;

  if v_alt.status = p_status then
    return p_basis_id;
  end if;

  if p_status = 'active' and v_alt.relationship_status <> 'active' then
    raise exception 'training relationship is not active' using errcode = '22023';
  end if;

  update public.training_bases
     set status     = p_status,
         updated_at = now(),
         updated_by = v_actor
   where id = p_basis_id;


  return p_basis_id;
end;
$function$;

CREATE OR REPLACE FUNCTION app.waitlist_before_basis_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_eintrag record;
begin
  for v_eintrag in
    select w.id, w.organization_id, w.patient_id
    from public.waitlist_entries w
    where w.treatment_basis_id = old.id
      and w.status = 'open'
      and exists (
        select 1 from public.waitlist_entries d
        where d.patient_id = w.patient_id
          and d.status = 'open'
          and d.treatment_basis_id is null
      )
    for update
  loop
    update public.waitlist_entries w
       set status = 'withdrawn',
           closed_at = clock_timestamp(),
           closed_by = auth.uid(),
           updated_at = clock_timestamp(),
           updated_by = auth.uid()
     where w.id = v_eintrag.id;

  end loop;
  return old;
end;
$function$;

CREATE OR REPLACE FUNCTION public.add_patient_course_event(p_patient_id uuid, p_occurred_on date, p_kind text, p_note text DEFAULT NULL::text)
 RETURNS uuid
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
  if not app.can_write_questionnaire_response() then
    raise exception 'not allowed to record course events' using errcode = '42501';
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to record course events' using errcode = '42501';
  end if;

  perform 1 from public.patients p
  where p.id = p_patient_id and p.organization_id = v_org;
  if not found then
    raise exception 'patient not found' using errcode = 'P0002';
  end if;

  if p_occurred_on is null then
    raise exception 'date is required' using errcode = '22023';
  end if;

  -- Art, Notiz und Tag pruefen die Constraints der Tabelle.
  insert into public.patient_course_events (
    organization_id, patient_id, occurred_on, kind, note, created_by
  )
  values (
    v_org, p_patient_id, p_occurred_on, p_kind, nullif(btrim(p_note), ''), v_actor
  )
  returning id into v_id;


  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.add_training_protocol_addendum(p_appointment_id uuid, p_content text, p_reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid;
  v_org   uuid;
  v_prot  record;
  v_id    uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.can_access_training_protocols() then
    perform app.record_denied_write(v_actor, 'training_protocol.updated', 'not allowed to write training protocols');
    return null;
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to write training protocols' using errcode = '42501';
  end if;

  select p.id, p.status, p.training_relationship_id into v_prot
  from public.training_protocols p
  join public.appointments a on a.id = p.appointment_id
  where p.appointment_id = p_appointment_id and p.organization_id = v_org
    and a.organization_id = v_org;
  if not found then
    raise exception 'training protocol not found' using errcode = 'P0002';
  end if;
  if v_prot.status <> 'final' then
    raise exception 'only a finalized training protocol takes an addendum' using errcode = '22023';
  end if;
  if p_content is null or length(btrim(p_content)) not between 1 and 5000 then
    raise exception 'addendum content out of range' using errcode = '22023';
  end if;
  if p_reason is null or length(btrim(p_reason)) not between 3 and 500 then
    raise exception 'an addendum needs a reason' using errcode = '22023';
  end if;

  insert into public.training_protocol_addenda (organization_id, protocol_id, content, reason, created_by)
  values (v_org, v_prot.id, btrim(p_content), btrim(p_reason), v_actor)
  returning id into v_id;


  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.appointments_training_protocol_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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

    -- ANN-186: Absage und Nichtantreffen sagen, dass die Einheit nicht
    -- stattgefunden hat; ein Entwurf daran faellt mit. Seit ABN-022
    -- (BEF-113) steht er im Loeschjournal und taucht nach einer
    -- Wiederherstellung nicht wieder auf; die Oberflaeche warnt vorher.
    with verworfen as (
      delete from public.training_protocols p
       where p.appointment_id = new.id and p.status = 'draft'
      returning p.id, p.organization_id, p.training_relationship_id
    )
    -- LOG-EPIC-001: der Verwurf steht im Loeschjournal, nicht im Auditlog.
    insert into public.deletion_journal
      (organization_id, run_id, target_table, target_id, retention_class, due_at)
    select v.organization_id, extensions.gen_random_uuid(), 'training_protocols', v.id,
           'trainingsverhaeltnis', now()
    from verworfen v;
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.assign_prescription_scan(p_file_id uuid, p_treatment_basis_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid;
  v_org   uuid;
  v_datei record;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_write_treatment_bases() then
    raise exception 'not allowed to write treatment_bases' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to write treatment_bases' using errcode = '42501';
  end if;

  select f.* into v_datei
  from public.patient_files f
  where f.id = p_file_id
    and f.organization_id = v_org
    and f.status = 'ready'
  for update;

  if not found then
    raise exception 'file not accessible' using errcode = '42501';
  end if;

  if v_datei.document_type <> 'verordnungsscan' then
    raise exception 'only a prescription scan can be assigned' using errcode = '22023';
  end if;

  if v_datei.treatment_basis_id is not null then
    raise exception 'prescription scan is already assigned' using errcode = '55000';
  end if;

  -- Nur an eine Grundlage derselben Patient:in in derselben Praxis: sonst
  -- traege der Scan eine fremde Akte.
  if not exists (
    select 1
    from public.treatment_bases tb
    where tb.id = p_treatment_basis_id
      and tb.organization_id = v_org
      and tb.patient_id = v_datei.patient_id
  ) then
    raise exception 'treatment basis not accessible' using errcode = '42501';
  end if;

  update public.patient_files
     set treatment_basis_id = p_treatment_basis_id
   where id = p_file_id;

end;
$function$;

CREATE OR REPLACE FUNCTION public.cancel_appointment(p_appointment_id uuid, p_expected_updated_at timestamp with time zone, p_reason text, p_received_on date, p_received_time time without time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor   uuid;
  v_org     uuid;
  v_tz      text;
  v_alt     record;
  v_eingang timestamptz;
  v_anlass  text;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- TRN-004: wie update_appointment - der Riegel an der Zeile entscheidet den Kontext.
  if not (app.can_cancel_appointment() or app.can_write_training_relationships()) then
    raise exception 'not allowed to cancel appointments' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to cancel appointments' using errcode = '42501';
  end if;

  if p_expected_updated_at is null then
    raise exception 'expected updated_at is required' using errcode = '22023';
  end if;

  -- Die Pflichtangabe wird vor jedem Lesen geprueft: eine unvollstaendige
  -- Eingabe darf nicht erst an der Constraint scheitern.
  if p_reason is null
     or p_reason not in ('patient_request', 'practice_request', 'patient_moved', 'practice_moved', 'other') then
    raise exception 'cancellation reason is required' using errcode = '22023';
  end if;

  -- Halb angegeben ist nicht angegeben: Ein Datum ohne Uhrzeit waere
  -- Mitternacht, und das ist eine Erfindung, keine Angabe.
  if (p_received_on is null) <> (p_received_time is null) then
    raise exception 'cancellation receipt needs date and time' using errcode = '22023';
  end if;

  if p_received_on is null then
    v_eingang := now();
  else
    select o.time_zone into v_tz from public.organizations o where o.id = v_org;
    if v_tz is null then
      raise exception 'organization has no time zone' using errcode = '22023';
    end if;
    v_eingang := (p_received_on + p_received_time) at time zone v_tz;
  end if;

  -- Eine Absage, die noch nicht eingegangen ist, gibt es nicht. Ohne diese
  -- Grenze liesse sich die Frist durch ein Datum in der Zukunft aushebeln.
  if v_eingang > now() then
    raise exception 'cancellation cannot be received in the future' using errcode = '22023';
  end if;

  select a.id, a.patient_id, a.staff_member_id, a.status, a.kind, a.starts_at, a.updated_at,
         a.training_relationship_id
    into v_alt
  from public.appointments a
  where a.id = p_appointment_id
    and a.organization_id = v_org
    -- TRN-006: kein Durchgriff ueber den gemeinsamen Kalender (ADR-022 Punkt 11).
    and app.may_write_appointment_context(a.kind)
  for update;

  if not found then
    raise exception 'appointment not found' using errcode = 'P0002';
  end if;

  if v_alt.status = 'cancelled' then
    raise exception 'appointment is already cancelled' using errcode = '22023';
  end if;

  if v_alt.status in ('completed', 'no_show') then
    raise exception 'completed appointment must be reopened first' using errcode = '22023';
  end if;

  if v_alt.status <> 'confirmed' then
    raise exception 'documented appointment cannot be changed' using errcode = '22023';
  end if;

  if v_alt.updated_at is distinct from p_expected_updated_at then
    raise exception 'appointment was changed meanwhile' using errcode = '40001';
  end if;

  -- Die Frist rechnet der Server, aus dem Eingang und dem VEREINBARTEN Beginn
  -- des Termins - nie aus der Eingabezeit und nie im Browser
  -- (PROJECT_PRINCIPLES.md 8).
  --
  -- Und nur an einer BEHANDLUNG: Ein Ereignis des Praxisbetriebs hat keine
  -- Patient:in, die absagen koennte, und keinen Behandlungsbeginn, auf den
  -- sich eine Frist beziehen liesse (CAL-016, 8.1).
  -- ANN-178: Auch am Trainingstermin nicht - ob der Anlass im Dienstvertrag
  -- ueber Training entsteht, ist eine offene Vertragsfrage (ADR-022).
  v_anlass := case
    when v_alt.kind = 'therapy'
     and app.is_late_cancellation(p_reason, v_eingang, v_alt.starts_at) then 'late_cancellation'
    else null
  end;

  update public.appointments
     set status                   = 'cancelled',
         cancellation_reason      = p_reason,
         cancellation_received_at = v_eingang,
         fee_basis                = v_anlass,
         cancelled_at             = now(),
         cancelled_by             = v_actor,
         updated_at               = now()
   where id = p_appointment_id
     and updated_at = p_expected_updated_at
     and status = 'confirmed';

  if not found then
    raise exception 'appointment was changed meanwhile' using errcode = '40001';
  end if;


  return p_appointment_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.cancel_invoice(p_invoice_id uuid, p_reason text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor    uuid;
  v_org      uuid;
  v_invoice  record;
  v_zeitzone text;
  v_heute    date;
  v_prefix   text;
  v_nummer   text;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_manage_invoicing() then
    raise exception 'not allowed to manage invoices' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();

  select i.* into v_invoice
  from public.invoices i
  where i.id = p_invoice_id and i.organization_id = v_org
  for update;

  if not found then
    raise exception 'invoice not found' using errcode = '42501';
  end if;

  -- Ein Entwurf wird verworfen, nicht storniert: Er traegt keine Nummer und
  -- hinterlaesst keine Luecke (ADR-009, Konsequenz zu Punkt 8).
  if v_invoice.status <> 'issued' then
    raise exception 'only an issued invoice can be cancelled' using errcode = '23514';
  end if;

  if exists (
    select 1 from public.invoice_cancellations c where c.invoice_id = p_invoice_id
  ) then
    raise exception 'invoice is already cancelled' using errcode = '23514';
  end if;

  -- Ein Storno ohne Grund waere ein Beleg ohne Aussage - dieselbe Zusage wie
  -- beim Zahlungsstorno (ABR-004).
  if p_reason is null or length(btrim(p_reason)) < 3 then
    raise exception 'a cancellation needs a reason' using errcode = '22023';
  end if;

  -- ABN-008 (BEF-100): Eine stehende Zahlung sperrt das Storno nicht mehr.
  -- Ein tatsaechlich eingegangener Betrag darf nicht verschwinden; er bleibt
  -- an der stornierten Rechnung stehen, bis er zurueckgezahlt oder mit der
  -- Ersatzrechnung verrechnet ist. Ein Zahlungsstorno korrigiert nur eine
  -- falsche Buchung (ANN-079 Fassung 2).

  select o.time_zone into v_zeitzone from public.organizations o where o.id = v_org;
  v_heute := (now() at time zone v_zeitzone)::date;

  v_prefix := app.invoice_number_prefix(v_org, v_invoice.service_area);

  if v_prefix is null then
    raise exception 'practice billing profile missing' using errcode = '22023';
  end if;

  v_nummer := app.next_invoice_number(
    v_org, extract(year from v_heute)::smallint, v_invoice.service_area, v_prefix);

  insert into public.invoice_cancellations (
    organization_id, invoice_id, cancellation_number, reason, cancelled_on, created_by
  )
  values (v_org, p_invoice_id, v_nummer, btrim(p_reason), v_heute, v_actor);

  -- Die Leistungen sind wieder abrechenbar. Beides gehoert zusammen: die
  -- Freigabe der Zeile und der Zustand der Leistung; nur eines von beiden
  -- liesse die Leistung entweder unsichtbar oder doppelt abrechenbar.
  update public.invoice_items it
     set released_at = now()
   where it.invoice_id = p_invoice_id
     and it.released_at is null;

  update public.billable_services b
     set status = 'billable'
   where b.id in (
     select it.billable_service_id
     from public.invoice_items it
     where it.invoice_id = p_invoice_id
   );


  return v_nummer;
end;
$function$;

CREATE OR REPLACE FUNCTION public.claim_storage_deletion_order(p_order_id uuid)
 RETURNS TABLE(bucket_id text, object_key text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor   uuid;
  v_auftrag record;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_execute_storage_deletion() then
    -- G6c: abgewiesen wird mit einem bestaetigten denied-Eintrag und HTTP 403.
    perform app.record_denied_write(v_actor, 'storage_deletion.claimed', 'not allowed to execute deletion orders');
    return;
  end if;

  select o.* into v_auftrag
  from public.storage_deletion_orders o
  where o.id = p_order_id
    and o.organization_id = app.current_organization_id()
    and o.receipted_at is null;

  if not found then
    raise exception 'deletion order not accessible' using errcode = '42501';
  end if;


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
$function$;

CREATE OR REPLACE FUNCTION public.complete_appointment(p_appointment_id uuid, p_expected_updated_at timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid;
  v_org   uuid;
  v_alt   record;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- TRN-010 (ANN-186): Am Trainingstermin schliessen die Rollen ab, die ihn
  -- schreiben - owner, trainer, office (app.may_write_appointment_context).
  -- Welcher Kontext, entscheidet die Abfrage unten; eine Rolle ohne Zugang zum
  -- Kontext findet den Termin nicht (ADR-022 Punkt 11).
  if not (app.can_complete_appointment() or app.can_write_training_relationships()) then
    raise exception 'not allowed to complete appointments' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to complete appointments' using errcode = '42501';
  end if;

  if p_expected_updated_at is null then
    raise exception 'expected updated_at is required' using errcode = '22023';
  end if;

  select a.id, a.patient_id, a.staff_member_id, a.status, a.kind, a.updated_at,
         a.training_relationship_id
    into v_alt
  from public.appointments a
  where a.id = p_appointment_id
    and a.organization_id = v_org
    -- TRN-006: kein Durchgriff ueber den gemeinsamen Kalender (ADR-022 Punkt 11).
    and app.may_write_appointment_context(a.kind)
  for update;

  if not found then
    raise exception 'appointment not found' using errcode = 'P0002';
  end if;

  if v_alt.kind = 'internal' then
    raise exception 'event cannot be completed' using errcode = '22023';
  end if;

  if v_alt.status = 'cancelled' then
    raise exception 'cancelled appointment cannot be completed' using errcode = '22023';
  end if;

  if v_alt.status = 'no_show' then
    raise exception 'no-show appointment must be reopened first' using errcode = '22023';
  end if;

  if v_alt.status <> 'confirmed' then
    raise exception 'appointment is already completed' using errcode = '22023';
  end if;

  if v_alt.updated_at is distinct from p_expected_updated_at then
    raise exception 'appointment was changed meanwhile' using errcode = '40001';
  end if;

  update public.appointments
     set status       = 'completed',
         completed_at = now(),
         completed_by = v_actor,
         updated_at   = now()
   where id = p_appointment_id
     and updated_at = p_expected_updated_at
     and status = 'confirmed';

  if not found then
    raise exception 'appointment was changed meanwhile' using errcode = '40001';
  end if;


  return p_appointment_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.complete_questionnaire_response(p_response_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid;
  v_org   uuid;
  v_alt   record;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.can_write_questionnaire_response() then
    raise exception 'not allowed to record questionnaires' using errcode = '42501';
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to record questionnaires' using errcode = '42501';
  end if;

  select r.status, r.patient_id into v_alt
  from public.patient_questionnaire_responses r
  where r.id = p_response_id and r.organization_id = v_org
  for update;
  if not found then
    raise exception 'questionnaire response not found' using errcode = 'P0002';
  end if;
  if v_alt.status <> 'entwurf' then
    raise exception 'questionnaire response is completed' using errcode = '23514';
  end if;

  update public.patient_questionnaire_responses
     set status       = 'abgeschlossen',
         completed_at = now(),
         completed_by = v_actor,
         updated_at   = now(),
         updated_by   = v_actor
   where id = p_response_id;

end;
$function$;

CREATE OR REPLACE FUNCTION public.complete_therapy_report(p_report_id uuid, p_expected_updated_at timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid;
  v_org   uuid;
  b       public.therapy_reports%rowtype;
  v_tz    text;
  v_jetzt timestamptz;
  v_dok   jsonb;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.can_write_treatment_note() then
    raise exception 'not allowed to write therapy reports' using errcode = '42501';
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to write therapy reports' using errcode = '42501';
  end if;

  select * into b from public.therapy_reports r
  where r.id = p_report_id and r.organization_id = v_org
  for update;
  if not found then
    raise exception 'therapy report not found' using errcode = 'P0002';
  end if;
  if b.status <> 'entwurf' then
    raise exception 'therapy report is completed and cannot be changed' using errcode = '55000';
  end if;
  if b.updated_at is distinct from p_expected_updated_at then
    raise exception 'therapy report was changed in the meantime' using errcode = '40001';
  end if;
  if b.report_text is null and b.recommendation is null and cardinality(b.note_ids) = 0 then
    raise exception 'therapy report is empty' using errcode = '22023';
  end if;

  -- Seit dem Speichern kann eine Erhebung ersetzt worden sein.
  perform app.therapy_report_pruefen(v_org, b.patient_id, b.note_ids, b.body_chart_response_id);

  select o.time_zone into v_tz from public.organizations o where o.id = v_org;
  v_jetzt := clock_timestamp();
  v_dok := app.therapy_report_dokument(p_report_id)
           || jsonb_build_object('abgeschlossen', jsonb_build_object(
                'datum', (v_jetzt at time zone v_tz)::date,
                'von', (select up.display_name from public.user_profiles up where up.id = v_actor)));

  update public.therapy_reports r
     set status       = 'abgeschlossen',
         snapshot     = v_dok,
         completed_at = v_jetzt,
         completed_by = v_actor,
         updated_at   = v_jetzt,
         updated_by   = v_actor
   where r.id = p_report_id;

end;
$function$;

CREATE OR REPLACE FUNCTION public.conclude_patient_care(p_patient_id uuid, p_concluded_on date DEFAULT NULL::date)
 RETURNS date
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor  uuid;
  v_org    uuid;
  v_heute  date;
  v_tag    date;
  v_start  date;
  v_bisher date;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- SECURITY DEFINER umgeht RLS, deshalb wird die Berechtigung hier selbst
  -- geprueft.
  if not app.can_conclude_patient_care() then
    raise exception 'not allowed to conclude patient care' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to conclude patient care' using errcode = '42501';
  end if;

  select (now() at time zone o.time_zone)::date into v_heute
  from public.organizations o
  where o.id = v_org;

  v_tag := coalesce(p_concluded_on, v_heute);

  -- Ein Abschluss in der Zukunft waere eine Frist, die noch nicht laufen darf.
  if v_tag > v_heute then
    raise exception 'conclusion date is in the future' using errcode = '22023';
  end if;

  -- Zielpatient ausschliesslich in der Organisation des Aufrufers suchen: eine
  -- fremde ID ist damit von einer unbekannten nicht zu unterscheiden.
  select p.care_started_on, p.care_concluded_on
    into v_start, v_bisher
  from public.patients p
  where p.id = p_patient_id
    and p.organization_id = v_org
  for update;

  if not found then
    raise exception 'patient not found' using errcode = 'P0002';
  end if;

  if v_bisher is not null then
    raise exception 'patient care is already concluded' using errcode = '22023';
  end if;

  if v_start is not null and v_tag < v_start then
    raise exception 'conclusion date is before the start of care' using errcode = '22023';
  end if;

  update public.patients
     set care_concluded_on = v_tag,
         care_concluded_at = now(),
         care_concluded_by = v_actor
   where id = p_patient_id;


  return v_tag;
end;
$function$;

CREATE OR REPLACE FUNCTION public.confirm_patient_file_upload(p_file_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  -- Zweitreview: Eine schon bestaetigte, auf die Pruefung wartende Datei wird
  -- nicht ein zweites Mal bestaetigt (sonst ein zweites patient_file.uploaded).
  if v_datei.status <> 'pending' or v_datei.confirmation_requested_at is not null then
    raise exception 'file is not pending' using errcode = '22023';
  end if;

  -- Punkt 36: Ein Widerruf zwischen Vorbereitung und Bestaetigung laesst das
  -- Foto nicht mehr sichtbar werden.
  -- Und das Foto selbst ist seit seiner Aufnahme nicht faellig geworden: Ein
  -- Widerruf mit neuer Erteilung dazwischen gibt es nicht frei.
  if v_datei.document_type = 'patientenfoto'
     and not (
       app.patient_photo_accessible(v_datei.patient_id, null)
       and app.patient_photo_accessible(
         v_datei.patient_id, v_datei.created_at, v_datei.photo_locked_at
       )
     ) then
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

  -- ABN-024 (ADR-017 Punkt 51): Ist die Pruefung am Server scharf, wird die
  -- Datei erst mit ihrem Ergebnis ready (record_patient_file_verification).
  -- Bis dahin bleibt sie pending und traegt den Zeitpunkt der Bestaetigung.
  if app.patient_file_verification_required() then
    update public.patient_files
       set confirmation_requested_at = now()
     where id = p_file_id;
  else
    update public.patient_files
       set status = 'ready',
           confirmed_at = now()
     where id = p_file_id;
  end if;

end;
$function$;

CREATE OR REPLACE FUNCTION public.confirm_platform_account_deletion(p_account_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_auftrag public.platform_account_deletions%rowtype;
begin
  select * into v_auftrag
  from public.platform_account_deletions d
  where d.account_user_id = p_account_user_id
  for update;

  if not found then
    raise exception 'no deletion order for this account' using errcode = 'P0002';
  end if;

  if exists (select 1 from auth.users u where u.id = p_account_user_id) then
    raise exception 'account still exists' using errcode = '23514';
  end if;

  -- Beim erneuten Anwenden steht der Eintrag schon im Journal; er gilt erst
  -- jetzt, mit der Bestaetigung, als erneut angewandt (Zweitreview B1).
  if v_auftrag.reason <> 'reapply' then
    insert into public.deletion_journal
      (organization_id, run_id, target_table, target_id, retention_class, due_at)
    values
      (v_auftrag.organization_id, v_auftrag.run_id, 'auth_users', p_account_user_id,
       'plattformzugang', v_auftrag.due_at);
  else
    update public.deletion_journal
       set reapplied_at = now()
     where target_table = 'auth_users' and target_id = p_account_user_id;
  end if;

  delete from public.platform_account_deletions d where d.account_user_id = p_account_user_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.confirm_waitlist_entry(p_entry_id uuid, p_expected_updated_at timestamp with time zone)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor   uuid;
  v_org     uuid;
  v_eintrag public.waitlist_entries;
  v_stand   timestamptz;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.can_create_appointment() then
    raise exception 'not allowed to write waitlist' using errcode = '42501';
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to write waitlist' using errcode = '42501';
  end if;

  select * into v_eintrag
  from public.waitlist_entries w
  where w.id = p_entry_id and w.organization_id = v_org
  for update;
  if not found then
    raise exception 'waitlist entry not found' using errcode = 'P0002';
  end if;
  if v_eintrag.status <> 'open' then
    raise exception 'waitlist entry closed' using errcode = '22023';
  end if;
  if p_expected_updated_at is null or v_eintrag.updated_at <> p_expected_updated_at then
    raise exception 'waitlist entry changed' using errcode = '40001';
  end if;

  update public.waitlist_entries
     set updated_at = now(), updated_by = v_actor
   where id = p_entry_id
  returning updated_at into v_stand;


  return v_stand;
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_appointment(p_patient_id uuid, p_staff_member_id uuid, p_appointment_type text, p_date date, p_start_time time without time zone, p_end_time time without time zone, p_location_id uuid DEFAULT NULL::uuid, p_allow_outside_working_hours boolean DEFAULT false, p_treatment_basis_id uuid DEFAULT NULL::uuid, p_confirmed_past boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor          uuid;
  v_org            uuid;
  v_time_zone      text;
  v_heute          date;
  v_starts_at      timestamptz;
  v_ends_at        timestamptz;
  v_patient_status text;
  v_street         text;
  v_house          text;
  v_postal         text;
  v_city           text;
  v_location_id    uuid;
  v_appointment_id uuid;
  v_grid           smallint;
  v_ausserhalb     boolean;
  v_verordnung     uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_create_appointment() then
    raise exception 'not allowed to create appointments' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to create appointments' using errcode = '42501';
  end if;

  if p_appointment_type is null
     or p_appointment_type not in ('home_visit', 'practice', 'video') then
    raise exception 'unknown appointment type' using errcode = '22023';
  end if;

  if p_date is null or p_start_time is null or p_end_time is null then
    raise exception 'date, start time and end time are required' using errcode = '22023';
  end if;

  if p_end_time <= p_start_time then
    raise exception 'end time must be after start time' using errcode = '22023';
  end if;

  select o.time_zone, o.appointment_grid_minutes
    into v_time_zone, v_grid
  from public.organizations o
  where o.id = v_org;

  if v_time_zone is null then
    raise exception 'organization has no time zone' using errcode = '22023';
  end if;

  v_heute := (now() at time zone v_time_zone)::date;

  -- FIX-019, ANN-057: Die Vergangenheit ist erlaubt, aber nie unbemerkt.
  -- Ohne Bestaetigung bleibt die Abweisung aus CAL-003 - die Oberflaeche
  -- fragt nach und schickt den Vorgang bestaetigt neu.
  if p_date < v_heute and not coalesce(p_confirmed_past, false) then
    raise exception 'appointment date is in the past' using errcode = '22023';
  end if;

  if not app.is_on_appointment_grid(p_start_time, v_grid) then
    raise exception 'start time is not on the appointment grid' using errcode = '22023';
  end if;

  -- PROJECT_PRINCIPLES.md 0.11 Abschnitt 8.1: Die Laenge ist frei, aber sie
  -- liegt im Raster - mindestens ein Rasterschritt, ein ganzes Vielfaches
  -- davon (CAL-020, ANN-056). Mit dem Beginn im Raster liegt so auch das Ende
  -- auf einem Rasterpunkt.
  if not app.is_valid_treatment_length(p_end_time - p_start_time, v_grid) then
    raise exception 'appointment length is not on the appointment grid' using errcode = '22023';
  end if;

  v_starts_at := (p_date + p_start_time) at time zone v_time_zone;
  v_ends_at   := (p_date + p_end_time)   at time zone v_time_zone;

  select p.status into v_patient_status
  from public.patients p
  where p.id = p_patient_id
    and p.organization_id = v_org;

  if not found then
    raise exception 'patient not found' using errcode = 'P0002';
  end if;

  if v_patient_status <> 'active' then
    raise exception 'patient is not in active care' using errcode = '22023';
  end if;

  -- Die Grundlage muss zur Organisation UND zu derselben Patient:in gehoeren.
  -- Eine fremde und eine unbekannte ID erzeugen dieselbe Meldung und taugen
  -- damit nicht als Existenz-Orakel (PROJECT_PRINCIPLES.md 13).
  if p_treatment_basis_id is not null then
    select p.id into v_verordnung
    from public.treatment_bases p
    where p.id = p_treatment_basis_id
      and p.organization_id = v_org
      and p.patient_id = p_patient_id;

    if not found then
      raise exception 'treatment basis not found' using errcode = 'P0002';
    end if;
  end if;

  if not app.is_assignable_therapist(p_staff_member_id, v_org) then
    raise exception 'staff member not assignable' using errcode = 'P0002';
  end if;

  v_ausserhalb := not app.is_within_working_hours(
    p_staff_member_id, v_org, p_date, p_start_time, p_end_time
  );

  if v_ausserhalb and not coalesce(p_allow_outside_working_hours, false) then
    raise exception 'outside_working_hours' using errcode = '22023';
  end if;

  if p_appointment_type = 'practice' then
    if p_location_id is null then
      raise exception 'practice appointment requires a location' using errcode = '22023';
    end if;

    select l.id into v_location_id
    from public.locations l
    where l.id = p_location_id
      and l.organization_id = v_org;

    if not found then
      raise exception 'location not found' using errcode = 'P0002';
    end if;
  else
    v_location_id := null;
  end if;

  if p_appointment_type = 'home_visit' then
    select
      nullif(btrim(c.street), ''),
      nullif(btrim(c.house_number), ''),
      nullif(btrim(c.postal_code), ''),
      nullif(btrim(c.city), '')
      into v_street, v_house, v_postal, v_city
    from public.patient_contact_details c
    where c.patient_id = p_patient_id;

    if v_street is null or v_house is null or v_postal is null or v_city is null then
      raise exception 'home visit requires a complete patient address' using errcode = '22023';
    end if;
  end if;

  begin
    insert into public.appointments (
      organization_id, patient_id, staff_member_id, location_id,
      appointment_type, kind, status, starts_at, ends_at,
      visit_street, visit_house_number, visit_postal_code, visit_city,
      treatment_basis_id, created_by
    )
    values (
      v_org, p_patient_id, p_staff_member_id, v_location_id,
      -- ADR-018 Punkt 2: Ein angelegter Termin ist bestaetigt. 'requested' und
      -- 'tentative' gibt es erst mit einem Portal, das sie erzeugen kann.
      p_appointment_type, 'therapy', 'confirmed', v_starts_at, v_ends_at,
      v_street, v_house, v_postal, v_city,
      v_verordnung, v_actor
    )
    returning id into v_appointment_id;
  exception
    when exclusion_violation then
      raise exception 'appointment overlaps an existing one' using errcode = '23P01';
  end;


  return v_appointment_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_appointment_event(p_title text, p_staff_member_ids uuid[], p_appointment_type text, p_date date, p_start_time time without time zone, p_end_time time without time zone, p_location_id uuid DEFAULT NULL::uuid, p_allow_outside_working_hours boolean DEFAULT false)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor       uuid;
  v_org         uuid;
  v_tz          text;
  v_grid        smallint;
  v_heute       date;
  v_starts_at   timestamptz;
  v_ends_at     timestamptz;
  v_titel       text;
  v_location_id uuid;
  v_gruppe      uuid;
  v_personen    uuid[];
  v_person      uuid;
  v_ausserhalb  boolean;
  v_id          uuid;
  v_anzahl      integer := 0;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_create_appointment() then
    raise exception 'not allowed to create appointments' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to create appointments' using errcode = '42501';
  end if;

  v_titel := btrim(coalesce(p_title, ''));
  if v_titel = '' then
    raise exception 'event title is required' using errcode = '22023';
  end if;
  if length(v_titel) > 120 then
    raise exception 'event title is too long' using errcode = '22023';
  end if;

  if p_staff_member_ids is null or array_length(p_staff_member_ids, 1) is null then
    raise exception 'event needs at least one participant' using errcode = '22023';
  end if;

  -- Doppelt genannt ist einmal beteiligt. Ohne das Zusammenfassen bekaeme die
  -- Person zwei Zeilen zur selben Zeit - und die zweite scheiterte an der
  -- Ueberschneidung mit der ersten (CAL-017).
  select coalesce(array_agg(distinct p), array[]::uuid[])
    into v_personen
  from unnest(p_staff_member_ids) as p
  where p is not null;

  if array_length(v_personen, 1) is null then
    raise exception 'event needs at least one participant' using errcode = '22023';
  end if;

  -- Ein Ereignis findet in der Praxis oder als Video statt. Ein Hausbesuch
  -- ohne Patient:in waere ein Termin ohne Anschrift.
  if p_appointment_type is null or p_appointment_type not in ('practice', 'video') then
    raise exception 'unknown appointment type' using errcode = '22023';
  end if;

  if p_date is null or p_start_time is null or p_end_time is null then
    raise exception 'date, start time and end time are required' using errcode = '22023';
  end if;

  if p_end_time <= p_start_time then
    raise exception 'end time must be after start time' using errcode = '22023';
  end if;

  select o.time_zone, o.appointment_grid_minutes
    into v_tz, v_grid
  from public.organizations o
  where o.id = v_org;

  if v_tz is null then
    raise exception 'organization has no time zone' using errcode = '22023';
  end if;

  -- Frei waehlbar heisst frei im RASTER: Beide Enden liegen auf einem
  -- Rasterpunkt. Beim Behandlungstermin genuegt der Beginn, weil die Laenge
  -- fest ist; hier ist sie es nicht (PROJECT_PRINCIPLES.md 8.1).
  if not app.is_on_appointment_grid(p_start_time, v_grid) then
    raise exception 'start time is not on the appointment grid' using errcode = '22023';
  end if;
  if not app.is_on_appointment_grid(p_end_time, v_grid) then
    raise exception 'end time is not on the appointment grid' using errcode = '22023';
  end if;

  v_heute := (now() at time zone v_tz)::date;
  if p_date < v_heute then
    raise exception 'appointment date is in the past' using errcode = '22023';
  end if;

  v_starts_at := (p_date + p_start_time) at time zone v_tz;
  v_ends_at   := (p_date + p_end_time)   at time zone v_tz;

  if p_appointment_type = 'practice' then
    if p_location_id is null then
      raise exception 'practice appointment requires a location' using errcode = '22023';
    end if;

    select l.id into v_location_id
    from public.locations l
    where l.id = p_location_id
      and l.organization_id = v_org;

    if not found then
      raise exception 'location not found' using errcode = 'P0002';
    end if;
  else
    v_location_id := null;
  end if;

  v_gruppe := gen_random_uuid();

  foreach v_person in array v_personen
  loop
    -- Eigene Pruefung statt is_assignable_therapist: Beteiligte eines
    -- Ereignisses sind Beschaeftigte, nicht notwendig Behandelnde.
    if not exists (
      select 1 from public.staff_members sm
      where sm.id = v_person
        and sm.organization_id = v_org
        and sm.employment_status = 'active'
    ) then
      raise exception 'staff member not found' using errcode = 'P0002';
    end if;

    v_ausserhalb := not app.is_within_working_hours(
      v_person, v_org, p_date, p_start_time, p_end_time
    );

    if v_ausserhalb and not coalesce(p_allow_outside_working_hours, false) then
      raise exception 'outside_working_hours' using errcode = '22023';
    end if;

    begin
      insert into public.appointments (
        organization_id, patient_id, staff_member_id, location_id,
        appointment_type, kind, title, event_group_id, status, starts_at, ends_at, created_by
      )
      values (
        v_org, null, v_person, v_location_id,
        p_appointment_type, 'internal', v_titel, v_gruppe, 'confirmed',
        v_starts_at, v_ends_at, v_actor
      )
      returning id into v_id;
    exception
      when exclusion_violation then
        raise exception 'appointment overlaps an existing one' using errcode = '23P01';
    end;


    v_anzahl := v_anzahl + 1;
  end loop;

  return v_anzahl;
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_correction_draft(p_invoice_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor  uuid;
  v_org    uuid;
  v_alt    record;
  v_id     uuid;
  v_anzahl integer;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_manage_invoicing() then
    raise exception 'not allowed to manage invoices' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();

  select i.* into v_alt
  from public.invoices i
  where i.id = p_invoice_id and i.organization_id = v_org
  for update;

  if not found then
    raise exception 'invoice not found' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.invoice_cancellations c where c.invoice_id = p_invoice_id
  ) then
    raise exception 'only a cancelled invoice can be corrected' using errcode = '23514';
  end if;

  if exists (
    select 1 from public.invoices i
    where i.organization_id = v_org
      and i.patient_id is not distinct from v_alt.patient_id
      and i.training_relationship_id is not distinct from v_alt.training_relationship_id
      and i.period_month = v_alt.period_month
      and i.service_area = v_alt.service_area
      and i.status = 'draft'
  ) then
    raise exception 'a draft for this patient, month and service area already exists'
      using errcode = '23505';
  end if;

  insert into public.invoices (
    organization_id, patient_id, training_relationship_id, recipient_id, period_month,
    service_area, replaces_invoice_id, created_by
  )
  values (v_org, v_alt.patient_id, v_alt.training_relationship_id, v_alt.recipient_id,
          v_alt.period_month, v_alt.service_area, p_invoice_id, v_actor)
  returning id into v_id;

  insert into public.invoice_items (organization_id, invoice_id, billable_service_id, sort_order)
  select v_org, v_id, z.id, z.nummer
  from (
    select b.id,
           row_number() over (order by b.performed_on, c.code, b.id)::smallint as nummer
    from public.billable_services b
    join public.service_catalog_items c on c.id = b.catalog_item_id
    where b.organization_id = v_org
      and b.patient_id is not distinct from v_alt.patient_id
      and b.training_relationship_id is not distinct from v_alt.training_relationship_id
      and b.status = 'billable'
      and b.service_area = v_alt.service_area
      and date_trunc('month', b.performed_on)::date = v_alt.period_month
      and not exists (
        select 1 from public.invoice_items it
        where it.billable_service_id = b.id and it.released_at is null
      )
  ) z;

  get diagnostics v_anzahl = row_count;

  if v_anzahl = 0 then
    raise exception 'no billable services for this patient, month and service area'
      using errcode = '22023';
  end if;


  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_invoice_draft(p_patient_id uuid, p_period_month date, p_service_area text DEFAULT 'therapy'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor   uuid;
  v_org     uuid;
  v_monat   date;
  v_bereich text;
  v_id      uuid;
  v_empf    uuid;
  v_anzahl  integer;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_manage_invoicing() then
    raise exception 'not allowed to manage invoices' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  v_monat := date_trunc('month', p_period_month)::date;
  v_bereich := coalesce(nullif(btrim(p_service_area), ''), 'therapy');

  if v_bereich not in ('therapy', 'training') then
    raise exception 'unknown service area %', p_service_area using errcode = '22023';
  end if;

  -- TRN-008: Trainingsleistungen haengen am Trainingsverhaeltnis, nie an der
  -- Akte (ADR-021 Punkt 3). Ihr Entwurf entsteht ueber
  -- create_training_invoice_draft; hier gibt es fuer `training` nichts zu
  -- finden, und die Meldung sagt, wo es steht.
  if v_bereich = 'training' then
    raise exception 'training invoices are drafted for the training relationship (create_training_invoice_draft)'
      using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.patients p
    where p.id = p_patient_id and p.organization_id = v_org
  ) then
    raise exception 'patient not found' using errcode = '42501';
  end if;

  -- Die Vorgabe aus den Stammdaten; ohne sie geht die Rechnung an die
  -- Patientin selbst (ANN-076).
  select r.id into v_empf
  from public.invoice_recipients r
  where r.patient_id = p_patient_id and r.is_default;

  insert into public.invoices (
    organization_id, patient_id, recipient_id, period_month, service_area, created_by
  )
  values (v_org, p_patient_id, v_empf, v_monat, v_bereich, v_actor)
  returning id into v_id;

  insert into public.invoice_items (organization_id, invoice_id, billable_service_id, sort_order)
  select v_org, v_id, z.id, z.nummer
  from (
    select b.id,
           row_number() over (order by b.performed_on, c.code, b.id)::smallint as nummer
    from public.billable_services b
    join public.service_catalog_items c on c.id = b.catalog_item_id
    where b.organization_id = v_org
      and b.patient_id = p_patient_id
      and b.status = 'billable'
      and b.service_area = v_bereich
      and date_trunc('month', b.performed_on)::date = v_monat
      and not exists (
        select 1 from public.invoice_items it
        where it.billable_service_id = b.id and it.released_at is null
      )
  ) z;

  get diagnostics v_anzahl = row_count;

  if v_anzahl = 0 then
    raise exception 'no billable services for this patient, month and service area'
      using errcode = '22023';
  end if;


  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_patient(p_given_name text, p_family_name text, p_date_of_birth date, p_email text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_street text DEFAULT NULL::text, p_house_number text DEFAULT NULL::text, p_postal_code text DEFAULT NULL::text, p_city text DEFAULT NULL::text, p_phone_work text DEFAULT NULL::text, p_phone_mobile text DEFAULT NULL::text, p_fax text DEFAULT NULL::text, p_institution text DEFAULT NULL::text, p_primary_therapist_staff_member_id uuid DEFAULT NULL::uuid, p_home_visit_access_note text DEFAULT NULL::text, p_special_note text DEFAULT NULL::text, p_remark text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor      uuid;
  v_org        uuid;
  v_person_id  uuid;
  v_patient_id uuid;
  v_given      text;
  v_family     text;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- SECURITY DEFINER umgeht RLS, deshalb wird die Berechtigung hier selbst
  -- geprueft.
  if not app.can_create_patient() then
    raise exception 'not allowed to create patients' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to create patients' using errcode = '42501';
  end if;

  -- Eingaben serverseitig normalisieren. Die Pruefung im Client ist
  -- Bedienkomfort, keine Zusicherung (ADR-004).
  v_given  := nullif(btrim(p_given_name), '');
  v_family := nullif(btrim(p_family_name), '');

  if v_given is null or v_family is null then
    raise exception 'given_name and family_name are required' using errcode = '22023';
  end if;

  if p_date_of_birth is null then
    raise exception 'date_of_birth is required' using errcode = '22023';
  end if;

  if p_date_of_birth > current_date then
    raise exception 'date_of_birth must not be in the future' using errcode = '22023';
  end if;

  perform app.assert_staff_member_in_org(p_primary_therapist_staff_member_id, v_org);

  insert into public.persons (organization_id, given_name, family_name, created_by)
  values (v_org, v_given, v_family, v_actor)
  returning id into v_person_id;

  insert into public.patients (organization_id, person_id, status, created_by)
  values (v_org, v_person_id, 'active', v_actor)
  returning id into v_patient_id;

  insert into public.patient_contact_details (
    patient_id, organization_id, date_of_birth,
    email, phone, street, house_number, postal_code, city,
    phone_work, phone_mobile, fax, institution, created_by
  )
  values (
    v_patient_id, v_org, p_date_of_birth,
    nullif(btrim(p_email), ''),
    nullif(btrim(p_phone), ''),
    nullif(btrim(p_street), ''),
    nullif(btrim(p_house_number), ''),
    nullif(btrim(p_postal_code), ''),
    nullif(btrim(p_city), ''),
    nullif(btrim(p_phone_work), ''),
    nullif(btrim(p_phone_mobile), ''),
    nullif(btrim(p_fax), ''),
    nullif(btrim(p_institution), ''),
    v_actor
  );

  insert into public.patient_care_details (
    patient_id, organization_id, primary_therapist_staff_member_id,
    home_visit_access_note, special_note, remark, created_by
  )
  values (
    v_patient_id, v_org, p_primary_therapist_staff_member_id,
    nullif(btrim(p_home_visit_access_note), ''),
    nullif(btrim(p_special_note), ''),
    nullif(btrim(p_remark), ''),
    v_actor
  );


  return v_patient_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_payment_reminder(p_invoice_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  -- Die Frist der Erinnerung, an genau einer Stelle (**ANN-080**). Vierzehn
  -- Tage sind die Frist, die auf dem Blatt steht - keine Rechtsfolge und kein
  -- Verzugsbeginn. Wer sie aendert, aendert sie hier.
  c_frist_tage constant integer := 14;
  v_actor    uuid;
  v_org      uuid;
  v_invoice  record;
  v_zeitzone text;
  v_heute    date;
  v_offen    integer;
  v_id       uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_manage_invoicing() then
    raise exception 'not allowed to manage invoices' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();

  select i.* into v_invoice
  from public.invoices i
  where i.id = p_invoice_id and i.organization_id = v_org
  for update;

  if not found then
    raise exception 'invoice not found' using errcode = '42501';
  end if;

  -- An einem Entwurf gibt es nichts zu erinnern: Er traegt keine Nummer und
  -- keine Forderung (ANN-075).
  if v_invoice.status <> 'issued' then
    raise exception 'a payment reminder belongs to an issued invoice' using errcode = '23514';
  end if;

  if exists (
    select 1 from public.invoice_cancellations c where c.invoice_id = p_invoice_id
  ) then
    raise exception 'a cancelled invoice is not reminded' using errcode = '23514';
  end if;

  select o.time_zone into v_zeitzone from public.organizations o where o.id = v_org;
  v_heute := (now() at time zone v_zeitzone)::date;

  -- Vor der Faelligkeit gibt es nichts zu erinnern.
  if v_invoice.due_on >= v_heute then
    raise exception 'this invoice is not overdue yet' using errcode = '23514';
  end if;

  -- Der offene Betrag kommt aus derselben Funktion wie jede andere Anzeige
  -- (ANN-078) - und wird hier festgeschrieben, weil er auf ein Blatt geht.
  v_offen := v_invoice.total_cents - app.invoice_paid_cents(p_invoice_id);

  if v_offen <= 0 then
    raise exception 'this invoice has nothing outstanding' using errcode = '23514';
  end if;

  if exists (
    select 1 from public.invoice_payment_reminders r
    where r.invoice_id = p_invoice_id and r.reminder_on = v_heute
  ) then
    raise exception 'a payment reminder for this invoice was already written today'
      using errcode = '23505';
  end if;

  insert into public.invoice_payment_reminders (
    organization_id, invoice_id, reminder_on, due_on, outstanding_cents, currency, created_by
  )
  values (v_org, p_invoice_id, v_heute, v_heute + c_frist_tage, v_offen,
          v_invoice.currency, v_actor)
  returning id into v_id;


  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_service_catalog_version(p_label text, p_valid_from date, p_copy_from uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid;
  v_org   uuid;
  v_label text;
  v_id    uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_manage_service_catalog() then
    raise exception 'not allowed to manage the service catalog' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to manage the service catalog' using errcode = '42501';
  end if;

  v_label := nullif(btrim(p_label), '');
  if v_label is null then
    raise exception 'label is required' using errcode = '22023';
  end if;

  if p_valid_from is null then
    raise exception 'valid_from is required' using errcode = '22023';
  end if;

  insert into public.service_catalog_versions (organization_id, label, valid_from, created_by)
  values (v_org, v_label, p_valid_from, v_actor)
  returning id into v_id;

  if p_copy_from is not null then
    insert into public.service_catalog_items (
      organization_id, catalog_version_id, sort_order, code, label,
      item_kind, remedy, unit_price_cents, currency, tax_treatment, tax_rate_permille,
      service_area, created_by
    )
    select v_org, v_id, q.sort_order, q.code, q.label,
           q.item_kind, q.remedy, q.unit_price_cents, q.currency,
           q.tax_treatment, q.tax_rate_permille, q.service_area, v_actor
    from public.service_catalog_items q
    join public.service_catalog_versions qv on qv.id = q.catalog_version_id
    where q.catalog_version_id = p_copy_from
      and qv.organization_id = v_org;

    -- Eine Vorlage, die es nicht gibt, ist ein Tippfehler und kein leerer
    -- Entwurf: Sonst entstuende stillschweigend eine Preisliste ohne Preise.
    if not exists (
      select 1 from public.service_catalog_items where catalog_version_id = v_id
    ) then
      raise exception 'copy source has no items' using errcode = '22023';
    end if;
  end if;


  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_staff_member(p_given_name text, p_family_name text, p_work_email text DEFAULT NULL::text, p_work_phone text DEFAULT NULL::text, p_primary_location_id uuid DEFAULT NULL::uuid, p_date_of_birth date DEFAULT NULL::date, p_private_email text DEFAULT NULL::text, p_private_phone text DEFAULT NULL::text, p_street text DEFAULT NULL::text, p_postal_code text DEFAULT NULL::text, p_city text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor       uuid;
  v_org         uuid;
  v_person_id   uuid;
  v_staff_id    uuid;
  v_given       text;
  v_family      text;
  v_location_id uuid;
  v_priv_email  text;
  v_priv_phone  text;
  v_street      text;
  v_postal      text;
  v_city        text;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- SECURITY DEFINER umgeht RLS, deshalb wird die Berechtigung hier selbst
  -- geprueft.
  if not app.can_manage_staff_master_data() then
    raise exception 'not allowed to manage staff' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to manage staff' using errcode = '42501';
  end if;

  v_given  := btrim(coalesce(p_given_name, ''));
  v_family := btrim(coalesce(p_family_name, ''));

  if v_given = '' or v_family = '' then
    raise exception 'given name and family name are required' using errcode = '22023';
  end if;

  v_priv_email := nullif(btrim(coalesce(p_private_email, '')), '');
  v_priv_phone := nullif(btrim(coalesce(p_private_phone, '')), '');
  v_street     := nullif(btrim(coalesce(p_street, '')), '');
  v_postal     := nullif(btrim(coalesce(p_postal_code, '')), '');
  v_city       := nullif(btrim(coalesce(p_city, '')), '');

  if not app.can_manage_staff_private_details()
     and (p_date_of_birth is not null or v_priv_email is not null or v_priv_phone is not null
          or v_street is not null or v_postal is not null or v_city is not null) then
    raise exception 'private_details_not_allowed' using errcode = '42501';
  end if;

  -- Standort ausschliesslich in der eigenen Organisation suchen: eine fremde
  -- und eine unbekannte ID sind damit ununterscheidbar.
  if p_primary_location_id is not null then
    select l.id into v_location_id
    from public.locations l
    where l.id = p_primary_location_id
      and l.organization_id = v_org;

    if not found then
      raise exception 'location not found' using errcode = 'P0002';
    end if;
  end if;

  insert into public.persons (organization_id, given_name, family_name, created_by)
  values (v_org, v_given, v_family, v_actor)
  returning id into v_person_id;

  insert into public.staff_members (
    organization_id, person_id, primary_location_id,
    employment_status, work_email, work_phone, created_by
  )
  values (
    v_org, v_person_id, v_location_id,
    'active',
    nullif(btrim(coalesce(p_work_email, '')), ''),
    nullif(btrim(coalesce(p_work_phone, '')), ''),
    v_actor
  )
  returning id into v_staff_id;

  -- Die Zeile entsteht immer, auch wenn alle Felder leer bleiben. Damit hat
  -- eine spaetere Aenderung der Privatdaten einen festen Anker und muss nicht
  -- zwischen Anlegen und Aendern unterscheiden.
  insert into public.staff_private_details (
    staff_member_id, organization_id, date_of_birth,
    private_email, private_phone, street, postal_code, city, created_by
  )
  values (
    v_staff_id, v_org, p_date_of_birth,
    v_priv_email, v_priv_phone, v_street, v_postal, v_city, v_actor
  );


  return v_staff_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_task(p_title text, p_note text DEFAULT NULL::text, p_due_on date DEFAULT NULL::date, p_assigned_staff_member_id uuid DEFAULT NULL::uuid, p_patient_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
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
  if not app.can_manage_tasks() then
    raise exception 'not allowed to write tasks' using errcode = '42501';
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to write tasks' using errcode = '42501';
  end if;

  perform app.task_check_input(v_org, p_patient_id, p_assigned_staff_member_id);

  insert into public.tasks (
    organization_id, patient_id, assigned_staff_member_id, title, note, due_on,
    created_by, updated_by
  )
  values (
    v_org, p_patient_id, p_assigned_staff_member_id, btrim(p_title),
    nullif(btrim(p_note), ''), p_due_on, v_actor, v_actor
  )
  returning id into v_id;


  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_text_snippet(p_title text, p_body text, p_shared boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid;
  v_org   uuid;
  v_staff uuid;
  v_id    uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_use_text_snippets() then
    raise exception 'not allowed to use text snippets' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to use text snippets' using errcode = '42501';
  end if;

  if coalesce(p_shared, false) then
    v_staff := null;
  else
    select sm.id into v_staff
    from public.staff_members sm
    where sm.person_id = app.current_person_id()
      and sm.organization_id = v_org;

    if v_staff is null then
      raise exception 'no staff member for this account' using errcode = '22023';
    end if;
  end if;

  perform app.assert_text_snippet_input(p_title, p_body, v_staff);

  insert into public.treatment_text_snippets (
    organization_id, staff_member_id, title, body, created_by, updated_by
  )
  values (v_org, v_staff, btrim(p_title), btrim(p_body, E' \t\r\n'), v_actor, v_actor)
  returning id into v_id;


  return v_id;
exception
  when unique_violation then
    raise exception 'a snippet with this title already exists' using errcode = '23505';
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_therapy_report(p_treatment_basis_id uuid, p_supersedes_report_id uuid DEFAULT NULL::uuid, p_change_reason text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor   uuid;
  v_org     uuid;
  v_patient uuid;
  v_kind    text;
  v_id      uuid;
  v_alt     record;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.can_write_treatment_note() then
    raise exception 'not allowed to write therapy reports' using errcode = '42501';
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to write therapy reports' using errcode = '42501';
  end if;

  select g.patient_id, g.treatment_basis_kind into v_patient, v_kind
  from public.treatment_bases g
  where g.id = p_treatment_basis_id and g.organization_id = v_org;
  if not found then
    raise exception 'treatment basis not found' using errcode = 'P0002';
  end if;
  if v_kind = 'self_pay' then
    raise exception 'a therapy report needs a prescription' using errcode = '22023';
  end if;

  -- ABN-016 (BEF-104): Eine Korrektur verweist auf den ersetzten,
  -- abgeschlossenen Bericht derselben Verordnung und traegt ihren Grund.
  if p_supersedes_report_id is not null then
    select r.status, r.treatment_basis_id into v_alt
    from public.therapy_reports r
    where r.id = p_supersedes_report_id and r.organization_id = v_org
    for update;
    if not found then
      raise exception 'therapy report not found' using errcode = 'P0002';
    end if;
    if v_alt.status <> 'abgeschlossen' then
      raise exception 'only a completed therapy report can be corrected' using errcode = '23514';
    end if;
    if v_alt.treatment_basis_id <> p_treatment_basis_id then
      raise exception 'correction must use the same treatment basis' using errcode = '23514';
    end if;
    if p_change_reason is null or length(btrim(p_change_reason)) not between 3 and 500 then
      raise exception 'a correction needs a reason' using errcode = '22023';
    end if;
    if exists (
      select 1 from public.therapy_reports r where r.supersedes_report_id = p_supersedes_report_id
    ) then
      raise exception 'therapy report already corrected' using errcode = '23505';
    end if;
  elsif p_change_reason is not null then
    raise exception 'a reason belongs to a correction' using errcode = '22023';
  end if;

  insert into public.therapy_reports (
    organization_id, patient_id, treatment_basis_id, created_by, updated_by,
    supersedes_report_id, change_reason
  )
  values (v_org, v_patient, p_treatment_basis_id, v_actor, v_actor,
          p_supersedes_report_id, nullif(btrim(p_change_reason), ''))
  returning id into v_id;


  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_training_appointment(p_training_relationship_id uuid, p_staff_member_id uuid, p_appointment_type text, p_date date, p_start_time time without time zone, p_end_time time without time zone, p_location_id uuid DEFAULT NULL::uuid, p_allow_outside_working_hours boolean DEFAULT false, p_training_basis_id uuid DEFAULT NULL::uuid, p_confirmed_past boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor          uuid;
  v_org            uuid;
  v_time_zone      text;
  v_grid           smallint;
  v_heute          date;
  v_starts_at      timestamptz;
  v_ends_at        timestamptz;
  v_status         text;
  v_basis_status   text;
  v_location_id    uuid;
  v_street         text;
  v_house          text;
  v_postal         text;
  v_city           text;
  v_ausserhalb     boolean;
  v_appointment_id uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_write_training_relationships() then
    -- Abgewiesen mit bestaetigtem denied-Eintrag und HTTP 403 (G6c, ANN-176).
    perform app.record_denied_write(v_actor, 'appointment.created', 'not allowed to create training appointments');
    return null;
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to create training appointments' using errcode = '42501';
  end if;

  if p_appointment_type is null
     or p_appointment_type not in ('home_visit', 'practice', 'video') then
    raise exception 'unknown appointment type' using errcode = '22023';
  end if;

  if p_date is null or p_start_time is null or p_end_time is null then
    raise exception 'date, start time and end time are required' using errcode = '22023';
  end if;

  if p_end_time <= p_start_time then
    raise exception 'end time must be after start time' using errcode = '22023';
  end if;

  select o.time_zone, o.appointment_grid_minutes
    into v_time_zone, v_grid
  from public.organizations o
  where o.id = v_org;

  if v_time_zone is null then
    raise exception 'organization has no time zone' using errcode = '22023';
  end if;

  v_heute := (now() at time zone v_time_zone)::date;

  if p_date < v_heute and not coalesce(p_confirmed_past, false) then
    raise exception 'appointment date is in the past' using errcode = '22023';
  end if;

  if not app.is_on_appointment_grid(p_start_time, v_grid) then
    raise exception 'start time is not on the appointment grid' using errcode = '22023';
  end if;

  if not app.is_valid_treatment_length(p_end_time - p_start_time, v_grid) then
    raise exception 'appointment length is not on the appointment grid' using errcode = '22023';
  end if;

  v_starts_at := (p_date + p_start_time) at time zone v_time_zone;
  v_ends_at   := (p_date + p_end_time)   at time zone v_time_zone;

  select t.status into v_status
  from public.training_relationships t
  where t.id = p_training_relationship_id
    and t.organization_id = v_org;

  if not found then
    raise exception 'training relationship not found' using errcode = 'P0002';
  end if;

  if v_status <> 'active' then
    raise exception 'training relationship is not active' using errcode = '22023';
  end if;

  -- Eine fremde und eine unbekannte Klammer erzeugen dieselbe Meldung.
  if p_training_basis_id is not null then
    select b.status into v_basis_status
    from public.training_bases b
    where b.id = p_training_basis_id
      and b.organization_id = v_org
      and b.training_relationship_id = p_training_relationship_id;

    if not found then
      raise exception 'training basis not found' using errcode = 'P0002';
    end if;

    if v_basis_status <> 'active' then
      raise exception 'training basis is concluded' using errcode = '22023';
    end if;
  end if;

  if not app.is_assignable_trainer(p_staff_member_id, v_org) then
    raise exception 'staff member not assignable' using errcode = 'P0002';
  end if;

  v_ausserhalb := not app.is_within_working_hours(
    p_staff_member_id, v_org, p_date, p_start_time, p_end_time
  );

  if v_ausserhalb and not coalesce(p_allow_outside_working_hours, false) then
    raise exception 'outside_working_hours' using errcode = '22023';
  end if;

  if p_appointment_type = 'practice' then
    if p_location_id is null then
      raise exception 'practice appointment requires a location' using errcode = '22023';
    end if;

    select l.id into v_location_id
    from public.locations l
    where l.id = p_location_id
      and l.organization_id = v_org;

    if not found then
      raise exception 'location not found' using errcode = 'P0002';
    end if;
  else
    v_location_id := null;
  end if;

  -- ANN-177: Hausbesuch mit der Anschrift aus dem Trainingskontakt.
  if p_appointment_type = 'home_visit' then
    select x.street, x.house_number, x.postal_code, x.city
      into v_street, v_house, v_postal, v_city
    from app.training_visit_address(p_training_relationship_id) x;

    if v_street is null or v_house is null or v_postal is null or v_city is null then
      raise exception 'home visit requires a complete address' using errcode = '22023';
    end if;
  end if;

  begin
    insert into public.appointments (
      organization_id, training_relationship_id, training_basis_id,
      staff_member_id, location_id, appointment_type, kind, status,
      starts_at, ends_at,
      visit_street, visit_house_number, visit_postal_code, visit_city,
      created_by
    )
    values (
      v_org, p_training_relationship_id, p_training_basis_id,
      p_staff_member_id, v_location_id, p_appointment_type, 'training', 'confirmed',
      v_starts_at, v_ends_at,
      v_street, v_house, v_postal, v_city,
      v_actor
    )
    returning id into v_appointment_id;
  exception
    when exclusion_violation then
      raise exception 'appointment overlaps an existing one' using errcode = '23P01';
  end;


  return v_appointment_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_training_basis(p_relationship_id uuid, p_started_on date DEFAULT NULL::date, p_agreed_quantity integer DEFAULT NULL::integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor  uuid;
  v_org    uuid;
  v_status text;
  v_id     uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.can_write_training_relationships() then
    perform app.record_denied_write(v_actor, 'training_basis.created', 'not allowed to manage training bases');
    return null;
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to manage training bases' using errcode = '42501';
  end if;

  select t.status into v_status
  from public.training_relationships t
  where t.id = p_relationship_id
    and t.organization_id = v_org;

  if not found then
    raise exception 'training relationship not found' using errcode = 'P0002';
  end if;

  if v_status <> 'active' then
    raise exception 'training relationship is not active' using errcode = '22023';
  end if;

  if p_agreed_quantity is not null and p_agreed_quantity not between 1 and 200 then
    raise exception 'agreed quantity must be between 1 and 200' using errcode = '22023';
  end if;

  insert into public.training_bases (
    organization_id, training_relationship_id, status, started_on, agreed_quantity, created_by
  )
  values (
    v_org, p_relationship_id, 'active',
    coalesce(p_started_on, app.training_today(v_org)), p_agreed_quantity, v_actor
  )
  returning id into v_id;


  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_training_client(p_given_name text, p_family_name text, p_date_of_birth date DEFAULT NULL::date, p_email text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_street text DEFAULT NULL::text, p_postal_code text DEFAULT NULL::text, p_city text DEFAULT NULL::text, p_contract_started_on date DEFAULT NULL::date, p_house_number text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor  uuid;
  v_org    uuid;
  v_person uuid;
  v_id     uuid;
  v_start  date;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.can_write_training_relationships() then
    -- Abgewiesen mit bestaetigtem denied-Eintrag und HTTP 403 (G6c).
    perform app.record_denied_write(v_actor, 'training_relationship.created', 'not allowed to manage training clients');
    return null;
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to manage training clients' using errcode = '42501';
  end if;

  if app.leer_zu_null(p_given_name) is null or app.leer_zu_null(p_family_name) is null then
    raise exception 'name is required' using errcode = '22023';
  end if;

  -- Ohne Angabe beginnt der Vertrag heute.
  v_start := coalesce(p_contract_started_on, app.training_today(v_org));

  insert into public.persons (organization_id, given_name, family_name, created_by)
  values (v_org, btrim(p_given_name), btrim(p_family_name), v_actor)
  returning id into v_person;

  insert into public.training_relationships (
    organization_id, person_id, status, contract_started_on, created_by
  )
  values (v_org, v_person, 'active', v_start, v_actor)
  returning id into v_id;

  perform app.write_training_contact(
    v_id, v_org, v_actor, p_date_of_birth, p_email, p_phone, p_street, p_house_number, p_postal_code, p_city
  );


  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_training_invoice_draft(p_training_relationship_id uuid, p_period_month date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor  uuid;
  v_org    uuid;
  v_monat  date;
  v_id     uuid;
  v_anzahl integer;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_manage_invoicing() then
    raise exception 'not allowed to manage invoices' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  v_monat := date_trunc('month', p_period_month)::date;

  if v_monat is null then
    raise exception 'period month is required' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.training_relationships t
    where t.id = p_training_relationship_id and t.organization_id = v_org
  ) then
    raise exception 'training relationship not found' using errcode = '42501';
  end if;

  -- ANN-182: kein Empfaenger - die Rechnung geht an die Kund:in selbst.
  insert into public.invoices (
    organization_id, training_relationship_id, recipient_id, period_month, service_area,
    created_by
  )
  values (v_org, p_training_relationship_id, null, v_monat, 'training', v_actor)
  returning id into v_id;

  insert into public.invoice_items (organization_id, invoice_id, billable_service_id, sort_order)
  select v_org, v_id, z.id, z.nummer
  from (
    select b.id,
           row_number() over (order by b.performed_on, c.code, b.id)::smallint as nummer
    from public.billable_services b
    join public.service_catalog_items c on c.id = b.catalog_item_id
    where b.organization_id = v_org
      and b.training_relationship_id = p_training_relationship_id
      and b.status = 'billable'
      and b.service_area = 'training'
      and date_trunc('month', b.performed_on)::date = v_monat
      and not exists (
        select 1 from public.invoice_items it
        where it.billable_service_id = b.id and it.released_at is null
      )
  ) z;

  get diagnostics v_anzahl = row_count;

  if v_anzahl = 0 then
    raise exception 'no billable services for this training client and month'
      using errcode = '22023';
  end if;


  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_treatment_basis(p_patient_id uuid, p_prescriber_id uuid, p_treatment_basis_kind text, p_issued_on date, p_appointment_count integer, p_items jsonb, p_frequency_note text DEFAULT NULL::text, p_note text DEFAULT NULL::text, p_diagnosis text DEFAULT NULL::text)
 RETURNS uuid
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

  -- SECURITY DEFINER umgeht RLS, deshalb wird die Berechtigung hier selbst
  -- geprueft. ANN-011: ohne office.
  if not app.can_write_treatment_bases() then
    raise exception 'not allowed to write treatment_bases' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to write treatment_bases' using errcode = '42501';
  end if;

  -- Patient ausschliesslich in der eigenen Organisation suchen.
  if not exists (
    select 1 from public.patients pa
    where pa.id = p_patient_id and pa.organization_id = v_org
  ) then
    raise exception 'patient not found' using errcode = 'P0002';
  end if;

  perform app.assert_treatment_basis_input(v_org, p_prescriber_id, p_treatment_basis_kind, p_issued_on);
  perform app.assert_appointment_count(p_appointment_count);

  insert into public.treatment_bases (
    organization_id, patient_id, prescriber_id, treatment_basis_kind, issued_on,
    appointment_count, frequency_note, note, diagnosis, created_by, updated_by
  )
  values (
    v_org, p_patient_id, p_prescriber_id, p_treatment_basis_kind, p_issued_on,
    p_appointment_count,
    nullif(btrim(p_frequency_note), ''),
    nullif(btrim(p_note), ''),
    -- ADR-020 Punkt 4: Die Diagnose gehoert zur Verordnung. Beim Selbstzahler
    -- bleibt sie leer, auch wenn ein Aufrufer sie mitschickt.
    case when p_treatment_basis_kind = 'self_pay'
         then null else nullif(btrim(p_diagnosis), '') end,
    v_actor, v_actor
  )
  returning id into v_id;

  perform app.write_treatment_base_items(v_id, v_org, v_actor, p_items);


  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_treatment_note(p_appointment_id uuid, p_content text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor  uuid;
  v_org    uuid;
  v_inhalt text;
  v_termin record;
  v_note   uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_write_treatment_note() then
    raise exception 'not allowed to write treatment documentation' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to write treatment documentation' using errcode = '42501';
  end if;

  v_inhalt := btrim(coalesce(p_content, ''), E' \t\r\n');

  if v_inhalt = '' then
    raise exception 'documentation must not be empty' using errcode = '22023';
  end if;

  if length(v_inhalt) > 20000 then
    raise exception 'documentation is too long' using errcode = '22023';
  end if;

  select a.id, a.patient_id, a.status, a.kind
    into v_termin
  from public.appointments a
  where a.id = p_appointment_id
    and a.organization_id = v_org
    -- TRN-006: kein Durchgriff ueber den gemeinsamen Kalender (ADR-022 Punkt 11).
    and app.may_write_appointment_context(a.kind)
  for update;

  if not found then
    raise exception 'appointment not found' using errcode = 'P0002';
  end if;

  -- Ein Ereignis des Praxisbetriebs hat keine Patient:in - eine
  -- Behandlungsdokumentation daran haette kein Gegenueber (CAL-015b).
  if v_termin.kind = 'internal' then
    raise exception 'event cannot be documented' using errcode = '22023';
  end if;

  -- Eine Absage sagt aus, dass die Behandlung NICHT stattgefunden hat.
  -- Bestaetigte und abgeschlossene Termine sind dokumentierbar - der laufende
  -- Hausbesuch ist der Regelfall und noch nicht abgeschlossen.
  if v_termin.status = 'cancelled' then
    raise exception 'cancelled appointment cannot be documented' using errcode = '22023';
  end if;

  -- Nicht angetroffen heisst: keine Behandlung, also auch kein Nachweis
  -- (CAL-008c). Wer sich vertan hat, oeffnet den Termin wieder.
  if v_termin.status = 'no_show' then
    raise exception 'no-show appointment cannot be documented' using errcode = '22023';
  end if;

  begin
    insert into public.treatment_notes (
      organization_id, appointment_id, status, content, created_by, updated_by
    )
    values (
      v_org, p_appointment_id, 'draft', v_inhalt, v_actor, v_actor
    )
    returning id into v_note;
  exception
    when unique_violation then
      raise exception 'treatment note already exists' using errcode = '23505';
  end;


  return v_note;
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_treatment_note_addendum(p_parent_note_id uuid, p_content text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor    uuid;
  v_org      uuid;
  v_inhalt   text;
  v_eltern   record;
  v_patient  uuid;
  v_nachtrag uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_write_treatment_note() then
    raise exception 'not allowed to write treatment documentation' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to write treatment documentation' using errcode = '42501';
  end if;

  v_inhalt := btrim(coalesce(p_content, ''), E' \t\r\n');

  if v_inhalt = '' then
    raise exception 'documentation must not be empty' using errcode = '22023';
  end if;

  if length(v_inhalt) > 20000 then
    raise exception 'documentation is too long' using errcode = '22023';
  end if;

  select t.id, t.appointment_id, t.status, t.addendum_to_note_id
    into v_eltern
  from public.treatment_notes t
  where t.id = p_parent_note_id
    and t.organization_id = v_org
  for update;

  if not found then
    raise exception 'treatment note not found' using errcode = 'P0002';
  end if;

  if v_eltern.addendum_to_note_id is not null then
    raise exception 'addendum cannot be extended' using errcode = '22023';
  end if;

  if v_eltern.status <> 'final' then
    raise exception 'treatment note is not final' using errcode = '22023';
  end if;

  insert into public.treatment_notes (
    organization_id, appointment_id, addendum_to_note_id, status, content, created_by, updated_by
  )
  values (
    v_org, v_eltern.appointment_id, p_parent_note_id, 'draft', v_inhalt, v_actor, v_actor
  )
  returning id into v_nachtrag;

  select a.patient_id into v_patient
  from public.appointments a
  where a.id = v_eltern.appointment_id;


  return v_nachtrag;
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_waitlist_entry(p_patient_id uuid, p_treatment_basis_id uuid, p_preferred_staff_member_id uuid, p_appointment_type text, p_duration_minutes integer, p_time_windows jsonb, p_earliest_on date, p_needed_by date, p_priority_reason text, p_note text)
 RETURNS uuid
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
  if not app.can_create_appointment() then
    raise exception 'not allowed to write waitlist' using errcode = '42501';
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to write waitlist' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.patients p
    where p.id = p_patient_id and p.organization_id = v_org
  ) then
    raise exception 'patient not found' using errcode = 'P0002';
  end if;

  perform app.waitlist_check_input(
    v_org, p_patient_id, p_treatment_basis_id, p_preferred_staff_member_id,
    p_appointment_type, p_duration_minutes, p_time_windows, p_earliest_on,
    p_needed_by, p_priority_reason, p_note
  );

  begin
    insert into public.waitlist_entries (
      organization_id, patient_id, treatment_basis_id, preferred_staff_member_id,
      appointment_type, duration_minutes, time_windows, earliest_on, needed_by,
      priority_reason, note, created_by, updated_by
    ) values (
      v_org, p_patient_id, p_treatment_basis_id, p_preferred_staff_member_id,
      p_appointment_type, p_duration_minutes, coalesce(p_time_windows, '[]'::jsonb),
      p_earliest_on, p_needed_by, p_priority_reason, nullif(btrim(p_note), ''),
      v_actor, v_actor
    )
    returning id into v_id;
  exception
    when unique_violation then
      raise exception 'patient already on waitlist' using errcode = '23505';
  end;


  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.delete_billable_services(p_appointment_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor  uuid;
  v_org    uuid;
  v_anzahl integer;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_record_billable_services() then
    raise exception 'not allowed to record billable services' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();

  if not exists (
    select 1 from public.appointments a
    where a.id = p_appointment_id and a.organization_id = v_org
  ) then
    raise exception 'appointment not found' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.billable_services
    where appointment_id = p_appointment_id and status = 'invoiced'
  ) then
    raise exception 'billable service is already invoiced' using errcode = '23514';
  end if;

  -- Neu mit ABR-003: Ein Entwurf haelt seine Leistungen fest. Erst den
  -- Entwurf verwerfen, dann die Erfassung zuruecknehmen.
  if exists (
    select 1
    from public.invoice_items it
    join public.billable_services b on b.id = it.billable_service_id
    where b.appointment_id = p_appointment_id
      and it.released_at is null
  ) then
    raise exception 'billable service is part of an invoice draft' using errcode = '23514';
  end if;

  update public.treatment_base_items p
     set used_quantity = greatest(p.used_quantity - b.menge, 0)
  from (
    select treatment_base_item_id, sum(quantity)::smallint as menge
    from public.billable_services
    where appointment_id = p_appointment_id and treatment_base_item_id is not null
    group by treatment_base_item_id
  ) b
  where p.id = b.treatment_base_item_id;

  -- Freigegebene Rechnungszeilen fallen mit ihrer Leistung: Sie zeigen mit
  -- RESTRICT auf sie, und was die stornierte Rechnung ausgewiesen hat, steht
  -- in ihrem Snapshot und nicht in dieser Zuordnung (ADR-009 Punkt 10). Eine
  -- Zeile, die nicht freigegeben ist, kommt hier nie vorbei - der Block
  -- darueber weist den Vorgang dann schon ab.
  delete from public.invoice_items it
   using public.billable_services b
   where it.billable_service_id = b.id
     and b.appointment_id = p_appointment_id
     and it.released_at is not null;

  delete from public.billable_services where appointment_id = p_appointment_id;
  get diagnostics v_anzahl = row_count;


  return v_anzahl;
end;
$function$;

CREATE OR REPLACE FUNCTION public.delete_invoice_draft(p_invoice_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid;
  v_org   uuid;
  v_status text;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_manage_invoicing() then
    raise exception 'not allowed to manage invoices' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();

  select i.status into v_status
  from public.invoices i
  where i.id = p_invoice_id and i.organization_id = v_org
  for update;

  if not found then
    raise exception 'invoice not found' using errcode = '42501';
  end if;

  if v_status <> 'draft' then
    raise exception 'an issued invoice cannot be deleted' using errcode = '23514';
  end if;

  delete from public.invoices where id = p_invoice_id;

end;
$function$;

CREATE OR REPLACE FUNCTION public.delete_invoice_recipient(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor   uuid;
  v_org     uuid;
  v_patient uuid;
  v_kind    text;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_manage_invoicing() then
    raise exception 'not allowed to manage invoice recipients' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();

  select r.patient_id, r.recipient_kind
    into v_patient, v_kind
  from public.invoice_recipients r
  where r.id = p_id and r.organization_id = v_org;

  if not found then
    raise exception 'invoice recipient not found' using errcode = '42501';
  end if;

  delete from public.invoice_recipients where id = p_id;

end;
$function$;

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


  delete from public.patient_files where id = p_file_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.delete_service_catalog_version(p_version_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid;
  v_org   uuid;
  v_published timestamptz;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_manage_service_catalog() then
    raise exception 'not allowed to manage the service catalog' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();

  select v.published_at into v_published
  from public.service_catalog_versions v
  where v.id = p_version_id and v.organization_id = v_org;

  if not found then
    raise exception 'service catalog version not found' using errcode = '42501';
  end if;

  if v_published is not null then
    raise exception 'published service catalog version is immutable' using errcode = '23514';
  end if;


  delete from public.service_catalog_versions where id = p_version_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.delete_task(p_task_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor   uuid;
  v_org     uuid;
  v_patient uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.can_manage_tasks() then
    raise exception 'not allowed to write tasks' using errcode = '42501';
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to write tasks' using errcode = '42501';
  end if;

  delete from public.tasks k
  where k.id = p_task_id and k.organization_id = v_org
  returning k.patient_id into v_patient;

  if not found then
    raise exception 'task not found' using errcode = 'P0002';
  end if;

end;
$function$;

CREATE OR REPLACE FUNCTION public.delete_text_snippet(p_snippet_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid;
  v_org   uuid;
  v_alt   record;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_use_text_snippets() then
    raise exception 'not allowed to use text snippets' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to use text snippets' using errcode = '42501';
  end if;

  select s.id, s.staff_member_id, s.title
    into v_alt
  from public.treatment_text_snippets s
  where s.id = p_snippet_id
    and s.organization_id = v_org
    and (
      s.staff_member_id is null
      or s.staff_member_id in (
        select sm.id from public.staff_members sm where sm.person_id = app.current_person_id()
      )
    );

  if not found then
    raise exception 'text snippet not found' using errcode = 'P0002';
  end if;

  if v_alt.staff_member_id is null and not app.can_manage_shared_text_snippets() then
    raise exception 'not allowed to manage shared text snippets' using errcode = '42501';
  end if;

  delete from public.treatment_text_snippets where id = p_snippet_id;

end;
$function$;

CREATE OR REPLACE FUNCTION public.delete_treatment_basis(p_treatment_basis_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor      uuid;
  v_org        uuid;
  v_patient_id uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_write_treatment_bases() then
    raise exception 'not allowed to write treatment_bases' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to write treatment_bases' using errcode = '42501';
  end if;

  -- PRX-010 (Zweitreview): Mit der Grundlage fielen ihre klinischen Texte;
  -- das bleibt den therapeutischen Rollen vorbehalten.
  if not app.can_clear_treatment_basis_clinical_texts()
     and app.treatment_basis_has_clinical_texts(p_treatment_basis_id, v_org) then
    raise exception 'clinical texts on this treatment basis can only be cleared by treating roles'
      using errcode = '42501';
  end if;

  if exists (
    select 1 from public.therapy_reports r
    where r.treatment_basis_id = p_treatment_basis_id and r.organization_id = v_org
  ) then
    raise exception 'treatment basis has therapy reports' using errcode = '23503';
  end if;

  delete from public.treatment_bases p
  where p.id = p_treatment_basis_id
    and p.organization_id = v_org
  returning p.patient_id into v_patient_id;

  if not found then
    raise exception 'treatment basis not found' using errcode = 'P0002';
  end if;

end;
$function$;

CREATE OR REPLACE FUNCTION public.discard_questionnaire_response(p_response_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid;
  v_org   uuid;
  v_alt   record;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.can_write_questionnaire_response() then
    raise exception 'not allowed to record questionnaires' using errcode = '42501';
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to record questionnaires' using errcode = '42501';
  end if;

  select r.status, r.patient_id into v_alt
  from public.patient_questionnaire_responses r
  where r.id = p_response_id and r.organization_id = v_org
  for update;
  if not found then
    raise exception 'questionnaire response not found' using errcode = 'P0002';
  end if;
  if v_alt.status <> 'entwurf' then
    raise exception 'questionnaire response is completed' using errcode = '23514';
  end if;

  delete from public.patient_questionnaire_responses where id = p_response_id;

end;
$function$;

CREATE OR REPLACE FUNCTION public.discard_therapy_report(p_report_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor   uuid;
  v_org     uuid;
  v_patient uuid;
  v_status  text;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.can_write_treatment_note() then
    raise exception 'not allowed to write therapy reports' using errcode = '42501';
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to write therapy reports' using errcode = '42501';
  end if;

  select r.patient_id, r.status into v_patient, v_status
  from public.therapy_reports r
  where r.id = p_report_id and r.organization_id = v_org
  for update;
  if not found then
    raise exception 'therapy report not found' using errcode = 'P0002';
  end if;
  if v_status <> 'entwurf' then
    raise exception 'therapy report is completed and cannot be changed' using errcode = '55000';
  end if;

  delete from public.therapy_reports r where r.id = p_report_id;

end;
$function$;

CREATE OR REPLACE FUNCTION public.end_training_relationship(p_relationship_id uuid, p_ended_on date DEFAULT NULL::date)
 RETURNS date
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor  uuid;
  v_org    uuid;
  v_heute  date;
  v_tag    date;
  v_start  date;
  v_bisher date;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.can_write_training_relationships() then
    perform app.record_denied_write(v_actor, 'training_relationship.ended', 'not allowed to manage training clients');
    return null;
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to manage training clients' using errcode = '42501';
  end if;

  v_heute := app.training_today(v_org);
  v_tag := coalesce(p_ended_on, v_heute);
  if v_tag > v_heute then
    raise exception 'contract end is in the future' using errcode = '22023';
  end if;

  select t.contract_started_on, t.contract_ended_on into v_start, v_bisher
  from public.training_relationships t
  where t.id = p_relationship_id and t.organization_id = v_org
  for update;
  if not found then
    raise exception 'training relationship not found' using errcode = 'P0002';
  end if;
  if v_bisher is not null then
    raise exception 'training relationship has already ended' using errcode = '22023';
  end if;
  if v_start is not null and v_tag < v_start then
    raise exception 'contract end is before the contract start' using errcode = '22023';
  end if;

  update public.training_relationships
     set contract_ended_on = v_tag, status = 'inactive'
   where id = p_relationship_id;


  return v_tag;
end;
$function$;

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
        -- LOG-EPIC-001: Zugriffe, keine Abweisungen. Die Aktionen sind seit
        -- ADR-010 Fassung 3 ohnehin nur noch, was die Daten nicht zeigen.
        and al.outcome = 'success'
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
$function$;

CREATE OR REPLACE FUNCTION public.finalize_overdue_treatment_notes()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_note  record;
  v_count integer := 0;
begin
  for v_note in
    select t.id,
           t.organization_id,
           t.appointment_id,
           t.content,
           t.updated_by,
           a.patient_id,
           app.documentation_deadline(
             a.starts_at, t.created_at, o.time_zone, o.documentation_auto_finalize_days
           ) as due_at
    from public.treatment_notes t
    join public.appointments a   on a.id = t.appointment_id
    join public.organizations o  on o.id = t.organization_id
    where t.status = 'draft'
      and a.kind = 'therapy'
      and app.documentation_deadline(
            a.starts_at, t.created_at, o.time_zone, o.documentation_auto_finalize_days
          ) <= now()
    order by t.created_at
    for update of t skip locked
  loop
    update public.treatment_notes
       set status            = 'final',
           finalisation_kind = 'automatic',
           finalized_at      = now(),
           finalized_by      = null,
           updated_at        = now()
     where id = v_note.id;

    insert into public.treatment_note_versions (
      organization_id, note_id, version_no, content, change_reason, author_id
    )
    values (
      v_note.organization_id, v_note.id, 1, v_note.content, null, v_note.updated_by
    );


    perform app.mark_appointment_documented(v_note.appointment_id, null);

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$function$;

CREATE OR REPLACE FUNCTION public.finalize_training_protocol(p_appointment_id uuid, p_content text, p_expected_updated_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor     uuid;
  v_org       uuid;
  v_inhalt    text;
  v_termin    record;
  v_protokoll record;
  v_id        uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.can_access_training_protocols() then
    perform app.record_denied_write(v_actor, 'training_protocol.finalized', 'not allowed to write training protocols');
    return null;
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to write training protocols' using errcode = '42501';
  end if;

  v_inhalt := btrim(coalesce(p_content, ''), E' \t\r\n');
  if v_inhalt = '' then
    raise exception 'training protocol must not be empty' using errcode = '22023';
  end if;
  if length(v_inhalt) > 20000 then
    raise exception 'training protocol is too long' using errcode = '22023';
  end if;

  select a.id, a.status, a.training_relationship_id
    into v_termin
  from public.appointments a
  where a.id = p_appointment_id
    and a.organization_id = v_org
    and a.kind = 'training'
  for update;

  if not found then
    raise exception 'appointment not found' using errcode = 'P0002';
  end if;

  if v_termin.status = 'cancelled' then
    raise exception 'cancelled appointment cannot be protocolled' using errcode = '22023';
  end if;
  if v_termin.status = 'no_show' then
    raise exception 'no-show appointment cannot be protocolled' using errcode = '22023';
  end if;

  select p.id, p.status, p.updated_at
    into v_protokoll
  from public.training_protocols p
  where p.appointment_id = p_appointment_id
  for update;

  if found and v_protokoll.status = 'final' then
    raise exception 'finalized training protocol cannot be changed' using errcode = '22023';
  end if;

  -- Ein Termin ohne Protokoll ist nie `documented` (Trigger); hier also nur
  -- bestaetigt oder durchgefuehrt.
  if v_termin.status not in ('confirmed', 'completed') then
    raise exception 'appointment cannot be documented' using errcode = '22023';
  end if;

  if not found then
    begin
      insert into public.training_protocols (
        organization_id, training_relationship_id, appointment_id, status, content,
        created_by, updated_by, finalized_at, finalized_by
      )
      values (
        v_org, v_termin.training_relationship_id, p_appointment_id, 'final', v_inhalt,
        v_actor, v_actor, now(), v_actor
      )
      returning training_protocols.id into v_id;
    exception
      when unique_violation then
        raise exception 'training protocol already exists' using errcode = '23505';
    end;

  else
    if p_expected_updated_at is null then
      raise exception 'expected updated_at is required' using errcode = '22023';
    end if;
    if v_protokoll.updated_at is distinct from p_expected_updated_at then
      raise exception 'training protocol was changed meanwhile' using errcode = '40001';
    end if;

    v_id := v_protokoll.id;
    update public.training_protocols p
       set content      = v_inhalt,
           status       = 'final',
           updated_at   = now(),
           updated_by   = v_actor,
           finalized_at = now(),
           finalized_by = v_actor
     where p.id = v_id;
  end if;


  -- Zweitreview 3: Ohne den Uebergang nach `documented` gibt es keinen
  -- Abschluss - beide Richtungen der Invariante haengen an diesem Vorgang.
  if not app.mark_appointment_documented(p_appointment_id, v_actor) then
    raise exception 'appointment cannot be documented' using errcode = '40001';
  end if;

  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.finalize_treatment_note(p_note_id uuid, p_expected_updated_at timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor   uuid;
  v_org     uuid;
  v_note    record;
  v_patient uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_write_treatment_note() then
    raise exception 'not allowed to write treatment documentation' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to write treatment documentation' using errcode = '42501';
  end if;

  if p_expected_updated_at is null then
    raise exception 'expected updated_at is required' using errcode = '22023';
  end if;

  select t.id, t.appointment_id, t.content, t.status, t.updated_at, t.updated_by
    into v_note
  from public.treatment_notes t
  where t.id = p_note_id
    and t.organization_id = v_org
  for update;

  if not found then
    raise exception 'treatment note not found' using errcode = 'P0002';
  end if;

  if v_note.status = 'final' then
    raise exception 'treatment note is already final' using errcode = '22023';
  end if;

  if v_note.updated_at is distinct from p_expected_updated_at then
    raise exception 'treatment note was changed meanwhile' using errcode = '40001';
  end if;

  update public.treatment_notes
     set status            = 'final',
         finalisation_kind = 'manual',
         finalized_at      = now(),
         finalized_by      = v_actor,
         updated_at        = now(),
         updated_by        = v_actor
   where id = p_note_id
     and updated_at = p_expected_updated_at;

  if not found then
    raise exception 'treatment note was changed meanwhile' using errcode = '40001';
  end if;

  insert into public.treatment_note_versions (
    organization_id, note_id, version_no, content, change_reason, author_id
  )
  values (
    v_org, p_note_id, 1, v_note.content, null, v_note.updated_by
  );

  select a.patient_id into v_patient
  from public.appointments a
  where a.id = v_note.appointment_id;


  -- NEU mit CAL-008d: Die Finalisierung setzt den Terminzustand mit
  -- (ADR-018 Punkt 3). Kein Fehler, sondern der gewollte Seiteneffekt.
  perform app.mark_appointment_documented(v_note.appointment_id, v_actor);

  return p_note_id;
end;
$function$;

-- LOG-EPIC-001: der Zweifel an der Einwilligungsfaehigkeit (ADR-023 Punkt 13)
-- wird mit dem Zugang der rechtlichen Vertretung gespeichert, nicht mehr als
-- Auditeintrag. Neuer Parameter, deshalb drop/create.
drop function public.invite_platform_representation(text, uuid, text, text, text, text[], boolean, text, boolean, boolean);
drop function public.note_companion_capacity_doubt(text, uuid);

CREATE FUNCTION public.invite_platform_representation(p_relationship_kind text, p_relationship_id uuid, p_access_kind text, p_legal_basis text, p_representative_name text, p_proof_documents text[], p_health_scope boolean, p_consent_version text, p_earlier_messages boolean, p_finance_scope boolean, p_capacity_doubt boolean DEFAULT false)
 RETURNS TABLE(access_id uuid, invitation_id uuid, purpose text, code text, expires_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor  uuid;
  v_org    uuid;
  v_rel    record;
  v_access uuid;
  v_inv    record;
  v_docs   text[];
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.can_manage_platform_access(p_relationship_kind) then
    perform app.record_denied_write(v_actor, 'platform_access.invited', 'not allowed to manage platform access');
    return;
  end if;
  v_org := app.current_organization_id();

  select * into v_rel
  from app.platform_relationship(p_relationship_kind, p_relationship_id) r
  where r.organization_id = v_org;
  if not found then
    raise exception 'relationship not found' using errcode = 'P0002';
  end if;

  perform app.assert_platform_representation(
    p_access_kind, p_legal_basis, v_rel.date_of_birth,
    (select o.time_zone from public.organizations o where o.id = v_org), p_representative_name,
    p_proof_documents, p_health_scope, p_consent_version, p_earlier_messages, p_finance_scope
  );

  -- Ein Zweifel schliesst die Begleitung aus; vermerkt wird er nur an einer
  -- rechtlichen Vertretung (ANN-207 Fassung 2).
  if coalesce(p_capacity_doubt, false) and p_access_kind <> 'legal_representative' then
    raise exception 'a capacity doubt allows only a legal representative' using errcode = '22023';
  end if;

  -- Nur die Dokumente, die zur Art gehoeren; doppelte fallen weg.
  select array_agg(distinct d order by d) into v_docs
  from unnest(p_proof_documents) d
  where d = 'identity_document'
     or (p_access_kind = 'legal_representative' and d = case p_legal_basis
           when 'custody' then 'custody_proof'
           when 'guardianship' then 'guardianship_certificate'
           else 'power_of_attorney' end);

  insert into public.platform_accesses (
    organization_id, relationship_kind, relationship_id, patient_id, training_relationship_id,
    access_kind, legal_basis, representative_name, proof_documents, health_scope, finance_scope,
    proof_recorded_by, proof_recorded_at,
    consent_text_version, consent_recorded_by, consent_recorded_at, consent_earlier_messages,
    companion_declined_at, companion_declined_by, companion_declined_reason,
    created_by
  )
  values (
    v_org, p_relationship_kind, p_relationship_id,
    case when p_relationship_kind = 'treatment' then p_relationship_id end,
    case when p_relationship_kind = 'training' then p_relationship_id end,
    p_access_kind,
    case when p_access_kind = 'legal_representative' then p_legal_basis end,
    btrim(p_representative_name), v_docs,
    -- ABN-010: Gesundheitssorge vermerkt die Praxis bei Betreuung und
    -- Vorsorgevollmacht; das Sorgerecht umfasst sie.
    case when p_access_kind = 'legal_representative' and p_legal_basis <> 'custody' then true end,
    -- Rechnungen nur, wenn nachgewiesen bzw. eingewilligt (BEF-119, BEF-116).
    p_finance_scope,
    v_actor, now(),
    case when p_access_kind = 'companion' then p_consent_version end,
    case when p_access_kind = 'companion' then v_actor end,
    case when p_access_kind = 'companion' then now() end,
    case when p_access_kind = 'companion' then p_earlier_messages end,
    case when coalesce(p_capacity_doubt, false) then now() end,
    case when coalesce(p_capacity_doubt, false) then v_actor end,
    case when coalesce(p_capacity_doubt, false) then 'capacity_doubt' end,
    v_actor
  )
  returning id into v_access;

  select * into v_inv from app.issue_platform_invitation(v_org, v_access, 'activate', v_actor);

  perform app.log_platform_access_event(
    v_org, v_actor, 'user', 'platform_access.invited', v_access,
    jsonb_build_object('surface', 'web', 'channel', 'on_site', 'purpose', 'activate',
                       'relationship_kind', p_relationship_kind, 'access_kind', p_access_kind,
                       'legal_basis', p_legal_basis, 'finance_scope', p_finance_scope)
  );

  return query select v_access, v_inv.invitation_id, 'activate'::text, v_inv.code, v_inv.expires_at;
end;
$function$;

revoke all on function public.invite_platform_representation(text, uuid, text, text, text, text[], boolean, text, boolean, boolean, boolean) from public, anon;
grant execute on function public.invite_platform_representation(text, uuid, text, text, text, text[], boolean, text, boolean, boolean, boolean) to authenticated;

comment on function public.invite_platform_representation(text, uuid, text, text, text, text[], boolean, text, boolean, boolean, boolean) is
  'Richtet eine Vertretung ein (rechtliche Vertretung oder Begleitung) mit Nachweisvermerk, nachgewiesenen bzw. eingewilligten Bereichen und Code fuer die Uebergabe vor Ort (POR-005, ABN-010). p_capacity_doubt vermerkt am Zugang einer rechtlichen Vertretung den Zweifel an der Einwilligungsfaehigkeit (ADR-023 Punkt 13, LOG-EPIC-001).';

CREATE OR REPLACE FUNCTION public.issue_invoice(p_invoice_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor    uuid;
  v_org      uuid;
  v_invoice  record;
  v_zeitzone text;
  v_heute    date;
  v_nummer   text;
  v_prefix   text;
  v_frist    smallint;
  v_dokument jsonb;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_manage_invoicing() then
    raise exception 'not allowed to manage invoices' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();

  select i.* into v_invoice
  from public.invoices i
  where i.id = p_invoice_id and i.organization_id = v_org
  for update;

  if not found then
    raise exception 'invoice not found' using errcode = '42501';
  end if;

  if v_invoice.status <> 'draft' then
    raise exception 'invoice is already issued' using errcode = '23514';
  end if;

  select o.time_zone into v_zeitzone from public.organizations o where o.id = v_org;
  v_heute := (now() at time zone v_zeitzone)::date;

  select b.payment_term_days into v_frist
  from public.practice_billing_profiles b
  where b.organization_id = v_org;

  -- Ohne Absender keine Rechnung. Der Hinweis nennt die Luecke, damit die
  -- Oberflaeche nicht raten muss, was fehlt (ADR-009 Punkt 10).
  if not found then
    raise exception 'practice billing profile missing' using errcode = '22023';
  end if;

  -- Das Kuerzel des Kreises, in den diese Rechnung gehoert (ABR-010).
  v_prefix := app.invoice_number_prefix(v_org, v_invoice.service_area);

  v_dokument := app.build_invoice_document(p_invoice_id);

  -- Der Par. 14c-Riegel (ABR-007, ADR-009 Punkt 18). Er steht hier und nicht
  -- in der Oberflaeche, weil die Steuerschuld mit dem **Ausweis** entsteht -
  -- nicht mit der Zahlung und nicht mit der Absicht. Was einmal falsch
  -- draufsteht, kostet ein Storno (Punkt 9).
  perform app.assert_invoice_tax_lawful(v_dokument);
  -- ABN-020 (BEF-111): keine Rechnung ohne vollstaendige Empfaengeranschrift.
  perform app.assert_invoice_recipient_address(v_dokument -> 'recipient');

  v_nummer := app.next_invoice_number(
    v_org, extract(year from v_heute)::smallint, v_invoice.service_area, v_prefix);

  -- Der Snapshot traegt Nummer und Daten mit: Er ist das Dokument, nicht ein
  -- Teil davon (ADR-009 Punkt 11).
  v_dokument := v_dokument || jsonb_build_object(
    'invoice_number', v_nummer,
    'issued_on', v_heute,
    'due_on', v_heute + v_frist::integer
  );

  update public.invoices
     set status          = 'issued',
         invoice_number  = v_nummer,
         issued_on       = v_heute,
         issued_at       = now(),
         issued_by       = v_actor,
         due_on          = v_heute + v_frist::integer,
         total_cents     = (v_dokument -> 'totals' ->> 'total_cents')::integer,
         tax_total_cents = (v_dokument -> 'totals' ->> 'tax_total_cents')::integer,
         currency        = v_dokument ->> 'currency',
         snapshot        = v_dokument
   where id = p_invoice_id;

  -- Die Leistung ist ab jetzt abgerechnet; ihr Entfernen laeuft nur noch ueber
  -- Storno (ADR-009 Punkt 9).
  update public.billable_services b
     set status = 'invoiced'
   where b.id in (select it.billable_service_id
                  from public.invoice_items it
                  where it.invoice_id = p_invoice_id);


  return v_nummer;
end;
$function$;

CREATE OR REPLACE FUNCTION public.merge_patients(p_source_patient_id uuid, p_target_patient_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  -- Ein Legal Hold folgt den Daten, die er schuetzt (ANN-150). Seit ABN-018
  -- (BEF-108) bleiben alle Gruende wirksam: Eine Akte kann mehrere aktive
  -- Sperren tragen, keine wird beim Zusammenfuehren aufgehoben.
  v_sperre := null;
  update public.legal_holds
     set subject_id = v_ziel.id
   where subject_type = 'patient' and subject_id = v_quelle.id;
  -- Fruehere Nachweise der Dublette ziehen mit (ABN-018).
  update public.patient_merge_records set target_patient_id = v_ziel.id
   where target_patient_id = v_quelle.id;

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

  -- Nachweis an der bleibenden Akte, so lange wie sie (ABN-018, BEF-108):
  -- nicht allein im dreijaehrigen Auditlog.
  insert into public.patient_merge_records (
    organization_id, target_patient_id, source_patient_id, merged_by, counts, photos_deleted
  )
  values (v_org, v_ziel.id, v_quelle.id, v_actor, v_plan -> 'counts', v_fotos);


  return jsonb_build_object(
    'target_patient_id', v_ziel.id,
    'moved', v_plan -> 'counts',
    'photos_deleted', v_fotos
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.offset_payment(p_cancelled_invoice_id uuid, p_replacement_invoice_id uuid, p_amount_cents integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor    uuid;
  v_org      uuid;
  v_alt      record;
  v_neu      record;
  v_zeitzone text;
  v_heute    date;
  v_gruppe   uuid := extensions.gen_random_uuid();
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_manage_invoicing() then
    raise exception 'not allowed to manage invoices' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();

  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'a payment needs a positive amount' using errcode = '22023';
  end if;

  -- Beide Rechnungen in fester Reihenfolge sperren (nach Kennung), damit zwei
  -- gleichzeitige Vorgaenge sich nicht kreuzweise blockieren.
  perform 1 from public.invoices i
   where i.id in (p_cancelled_invoice_id, p_replacement_invoice_id)
     and i.organization_id = v_org
   order by i.id
   for update;

  select i.* into v_alt
  from public.invoices i
  where i.id = p_cancelled_invoice_id and i.organization_id = v_org;
  if not found then
    raise exception 'invoice not found' using errcode = '42501';
  end if;

  select i.* into v_neu
  from public.invoices i
  where i.id = p_replacement_invoice_id and i.organization_id = v_org;
  if not found then
    raise exception 'invoice not found' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.invoice_cancellations c where c.invoice_id = p_cancelled_invoice_id
  ) then
    raise exception 'only a cancelled invoice can pass on its payments' using errcode = '23514';
  end if;

  -- Verrechnet wird mit der Rechnung, die diese ersetzt - nicht mit einer
  -- beliebigen offenen Rechnung derselben Person (ANN-215).
  if v_neu.replaces_invoice_id is distinct from p_cancelled_invoice_id
     or v_neu.status <> 'issued'
     or exists (
       select 1 from public.invoice_cancellations c where c.invoice_id = p_replacement_invoice_id
     ) then
    raise exception 'payments are offset only against the issued replacement invoice'
      using errcode = '23514';
  end if;

  if v_neu.currency <> v_alt.currency then
    raise exception 'currencies differ' using errcode = '23514';
  end if;

  if p_amount_cents > app.invoice_paid_cents(p_cancelled_invoice_id) then
    raise exception 'an offset cannot exceed the payments received' using errcode = '23514';
  end if;

  select o.time_zone into v_zeitzone from public.organizations o where o.id = v_org;
  v_heute := (now() at time zone v_zeitzone)::date;

  insert into public.payments (
    organization_id, invoice_id, direction, amount_cents, currency,
    paid_on, method, offset_group, created_by
  )
  values
    (v_org, p_cancelled_invoice_id,   'refund',   p_amount_cents, v_alt.currency,
     v_heute, 'offset', v_gruppe, v_actor),
    (v_org, p_replacement_invoice_id, 'incoming', p_amount_cents, v_neu.currency,
     v_heute, 'offset', v_gruppe, v_actor);


  return v_gruppe;
end;
$function$;

CREATE OR REPLACE FUNCTION public.place_legal_hold(p_patient_id uuid, p_reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  -- ABN-018 (BEF-108): Eine weitere Sperre mit eigenem Grund ist zulaessig;
  -- jede bleibt wirksam, bis sie selbst aufgehoben ist.

  insert into public.legal_holds (
    organization_id, subject_type, subject_id, reason, placed_by
  )
  values (v_org, 'patient', p_patient_id, btrim(p_reason), v_actor)
  returning id into v_hold;


  return v_hold;
end;
$function$;

CREATE OR REPLACE FUNCTION public.platform_invitation_mail(p_invitation_id uuid, p_code_hash text)
 RETURNS TABLE(email text, organization_name text, expires_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor  uuid;
  v_org    uuid;
  v_inv    record;
  v_aktuell text;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  v_org := app.current_organization_id();

  select i.id, i.email, i.expires_at, i.status, i.channel, i.code_hash,
         a.id as access_id, a.relationship_kind, a.relationship_id
    into v_inv
  from public.platform_access_invitations i
  join public.platform_accesses a on a.id = i.platform_access_id
  where i.id = p_invitation_id and i.organization_id = v_org
  for update of i;

  if v_inv.id is null or not app.can_manage_platform_access(v_inv.relationship_kind) then
    perform app.record_denied_write(v_actor, 'platform_access.invitation_sent', 'not allowed to manage platform access');
    return;
  end if;

  if v_inv.channel <> 'email' or v_inv.status <> 'pending' or v_inv.expires_at <= now()
     or v_inv.code_hash is distinct from lower(p_code_hash) then
    raise exception 'invitation cannot be sent' using errcode = '22023';
  end if;

  select r.email into v_aktuell
  from app.platform_relationship(v_inv.relationship_kind, v_inv.relationship_id) r;
  if v_aktuell is distinct from v_inv.email then
    raise exception 'address changed since invitation' using errcode = '22023';
  end if;

  update public.platform_access_invitations set sent_at = now() where id = v_inv.id;

  -- Der Versand steht an der Einladung (sent_at), nicht im Log (LOG-EPIC-001).

  return query
  select v_inv.email, o.name, v_inv.expires_at
  from public.organizations o where o.id = v_org;
end;
$function$;

CREATE OR REPLACE FUNCTION public.publish_service_catalog_version(p_version_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid;
  v_org   uuid;
  v_published timestamptz;
  v_valid_from date;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_manage_service_catalog() then
    raise exception 'not allowed to manage the service catalog' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();

  select v.published_at, v.valid_from into v_published, v_valid_from
  from public.service_catalog_versions v
  where v.id = p_version_id and v.organization_id = v_org;

  if not found then
    raise exception 'service catalog version not found' using errcode = '42501';
  end if;

  if v_published is not null then
    raise exception 'service catalog version is already published' using errcode = '23514';
  end if;

  if not exists (
    select 1 from public.service_catalog_items where catalog_version_id = p_version_id
  ) then
    raise exception 'service catalog version has no items' using errcode = '22023';
  end if;

  update public.service_catalog_versions
     set published_at = now(), published_by = v_actor
   where id = p_version_id;


  return p_version_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.reapply_deletion_journal()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    -- Vor Grundlage und Termin: ein Eintrag zeigt auf beide (on delete set
    -- null) - geloescht wird er vorher, damit nichts umgeschrieben wird
    -- (PRX-001, Zweitreview 5).
    'waitlist_entries',
    -- PRX-012: eine Aufgabe zeigt auf Person und Mitarbeitende (cascade
    -- beziehungsweise set null) - geloescht wird sie vorher.
    'tasks',
    -- TRN-009: das Trainingsprotokoll haengt am Termin (restrict) und faellt
    -- vor ihm - dieselbe Reihenfolge wie im Lauf.
    'training_protocols',
    -- PRX-014: der Anrufstand haengt am Termin und faellt vor ihm.
    'appointment_call_states',
    'treatment_base_items',
    'treatment_bases',
    'appointments',
    'legal_holds',
    'patient_contact_details',
    'patient_care_details',
    'patients',
    -- TRN-EPIC-003 (Zweitreview): Kontaktdaten des Trainings aus der
    -- Teilloeschung. Ihr Schluessel ist das Verhaeltnis, nicht `id`.
    'training_contact_details',
    -- TRN-005: die Vereinbarung nach ihren Terminen (on delete set null) und
    -- vor ihrem Verhaeltnis (restrict) - dieselbe Reihenfolge wie im Lauf
    -- (app.delete_training_relationship). Fehlte seit CAL-026.
    'training_bases',
    -- Vor persons: die Person faellt erst, wenn kein Verhaeltnis mehr auf
    -- sie zeigt - nach einem Restore genauso wie im Lauf (LEI-002).
    'training_relationships',
    'persons',
    'audit_log',
    'staff_account_invitations',
    -- POR-002: der Zugang mit seinen Einladungen (on delete cascade) und das
    -- Konto beim Anmeldedienst. `auth_users` ist kein Tabellenname in
    -- public, sondern die eine Ausnahme unten.
    'platform_accesses',
    'auth_users'
  ];
  v_tabelle   text;
  v_ids       uuid[];
  v_geloescht uuid[];
  v_unbekannt text[];
  v_gesamt    integer := 0;
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

    -- Das Konto einer Plattform liegt beim Anmeldedienst (ADR-023 Punkt 5).
    -- ABN-011 (BEF-115): auch hier ueber die Admin-API. Was nach dem Restore
    -- wieder da ist, verliert sofort jeden Zugang und bekommt einen
    -- Loeschauftrag. Als erneut angewandt gilt der Journaleintrag erst mit
    -- der Bestaetigung (confirm_platform_account_deletion, Zweitreview B1).
    if v_tabelle = 'auth_users' then
      update public.platform_accesses a
         set status = 'revoked',
             revoked_at = coalesce(a.revoked_at, now()),
             revoked_by = null,
             revoked_reason = 'account_deleted',
             locked_at = null,
             locked_by = null
       where a.account_user_id = any (v_ids) and a.status <> 'revoked';

      perform app.order_platform_account_deletion(
        j.target_id, j.organization_id, null, j.due_at, 'reapply')
      from public.deletion_journal j
      join auth.users u on u.id = j.target_id
      where j.target_table = 'auth_users'
        and j.target_id = any (v_ids);
      v_geloescht := null;
    else
    -- Tabellenname aus der festen Liste oben, nie aus Benutzereingabe;
    -- die Kennungen gehen als Parameter, nicht als Text.
    execute format(
      'with g as (delete from public.%I where %I = any($1) returning %I as id) select array_agg(id) from g',
      v_tabelle,
      app.deletion_key_column(v_tabelle),
      app.deletion_key_column(v_tabelle)
    )
    into v_geloescht
    using v_ids;
    end if;

    if v_geloescht is not null then
      update public.deletion_journal
         set reapplied_at = now()
       where target_table = v_tabelle
         and target_id = any (v_geloescht);

      v_gesamt := v_gesamt + array_length(v_geloescht, 1);
    end if;
  end loop;

  -- Die Wiederanwendung weist deletion_journal.reapplied_at nach (LOG-EPIC-001).

  return v_gesamt;
end;
$function$;

CREATE OR REPLACE FUNCTION public.receipt_storage_deletion_order(p_order_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor   uuid;
  v_auftrag record;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_execute_storage_deletion() then
    -- G6c: abgewiesen wird mit einem bestaetigten denied-Eintrag und HTTP 403.
    perform app.record_denied_write(v_actor, 'storage_deletion.receipted', 'not allowed to execute deletion orders');
    return;
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

end;
$function$;

CREATE OR REPLACE FUNCTION public.record_billable_services(p_appointment_id uuid, p_items jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor        uuid;
  v_org          uuid;
  v_status       text;
  v_fee_basis    text;
  v_basis        uuid;
  v_patient      uuid;
  v_kind         text;
  v_training     uuid;
  v_performed_on date;
  v_version      uuid;
  v_erwartet     text;
  v_anzahl       integer;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- PRX-009 (ANN-140): owner und office an jedem Termin, Behandelnde an
  -- ihrem eigenen Behandlungstermin (TRN-007). Ein fremder Termin ist von
  -- einem unbekannten nicht zu unterscheiden - beide scheitern hier gleich.
  if not app.can_record_services_for_appointment(p_appointment_id) then
    raise exception 'not allowed to record billable services' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();

  -- ABN-006: Ein Verzicht nimmt dem Anlass die Abrechenbarkeit, nicht den Anlass.
  select a.status, app.billable_fee_basis(a.fee_basis, a.fee_waived_at), a.treatment_basis_id, a.patient_id, a.kind,
         a.training_relationship_id
    into v_status, v_fee_basis, v_basis, v_patient, v_kind, v_training
  from public.appointments a
  where a.id = p_appointment_id and a.organization_id = v_org
  for update;

  if not found then
    raise exception 'appointment not found' using errcode = '42501';
  end if;

  -- TRN-007: Ein interner Termin hat kein Gegenueber und erzeugt nichts
  -- (Paragraf 19). Die Meldung bleibt die bisherige.
  if v_patient is null and v_training is null then
    raise exception 'appointment has no patient' using errcode = '22023';
  end if;

  -- Paragraf 19: Behandlung aus "dokumentiert" oder einem Gebuehrenanlass,
  -- ohne Override (ANN-072); Training aus dem durchgefuehrten Termin
  -- (ANN-181). Eine Stelle: app.appointment_is_billable.
  if not app.appointment_is_billable(v_kind, v_status, v_fee_basis) then
    if v_kind = 'training' then
      raise exception 'training appointment has not taken place' using errcode = '22023';
    end if;
    raise exception 'appointment is neither documented nor a fee occasion'
      using errcode = '22023';
  end if;

  if exists (select 1 from public.billable_services where appointment_id = p_appointment_id) then
    raise exception 'appointment already has billable services' using errcode = '23505';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'items must be a non-empty array' using errcode = '22023';
  end if;

  v_performed_on := app.appointment_performed_on(p_appointment_id);
  v_version := app.active_service_catalog_version(v_org, v_performed_on);

  if v_version is null then
    raise exception 'no published service catalog for %', v_performed_on using errcode = '22023';
  end if;

  v_erwartet := case when v_fee_basis is not null then 'absence_fee' else 'treatment' end;

  -- Zweitreview (ANN-140): Am eigenen Termin bestaetigen Behandelnde die
  -- Heilmittel. Ein Ausfallhonorar ist eine Forderung gegen die Patient:in
  -- und bleibt beim Buero.
  if v_erwartet = 'absence_fee' and not app.can_record_billable_services() then
    raise exception 'not allowed to record billable services' using errcode = '42501';
  end if;

  insert into public.billable_services (
    organization_id, patient_id, training_relationship_id, appointment_id, catalog_item_id,
    treatment_base_item_id, quantity, performed_on, created_by
  )
  select
    v_org,
    v_patient,
    v_training,
    p_appointment_id,
    i.id,
    -- Die Position der Grundlage, deren Menge diese Leistung verbraucht. Ein
    -- Trainingstermin hat keine Behandlungsgrundlage (ADR-022 Punkt 4); die
    -- Unterabfrage bleibt dann leer.
    (select p.id
       from public.treatment_base_items p
      where p.treatment_basis_id = v_basis
        and p.remedy = i.remedy
      limit 1),
    coalesce((zeile.eintrag ->> 'quantity')::smallint, 1::smallint),
    v_performed_on,
    v_actor
  from jsonb_array_elements(p_items) as zeile(eintrag)
  join public.service_catalog_items i
    on i.id = (zeile.eintrag ->> 'catalog_item_id')::uuid
   and i.catalog_version_id = v_version
   and i.item_kind = v_erwartet
   -- TRN-007: nur Positionen des Bereichs dieses Termins. Der Trigger wiese
   -- eine fremde ab; hier faellt sie aus dem Join und der ganze Vorgang
   -- scheitert mit einer Meldung, die den Grund nennt.
   and i.service_area = app.service_area_of_appointment_kind(v_kind);

  get diagnostics v_anzahl = row_count;

  -- Eine Position, die es in der geltenden Preisliste nicht gibt oder die
  -- nicht zum Anlass passt, faellt aus dem Join heraus. Stillschweigend
  -- weniger zu schreiben, als verlangt wurde, waere genau der Fehler aus
  -- Paragraf 13 - also scheitert der ganze Vorgang.
  if v_anzahl <> jsonb_array_length(p_items) then
    raise exception 'item does not belong to the catalog version valid on % or does not match %',
      v_performed_on, v_erwartet using errcode = '22023';
  end if;

  -- Die genutzte Menge der Grundlage wird jetzt fortgeschrieben (ANN-073).
  -- Die Constraint used_quantity <= prescribed_quantity bleibt bestehen und
  -- schuetzt die Abrechnung (ADR-020 Punkt 5); sie bekommt hier nur eine
  -- verstaendliche Meldung.
  begin
    update public.treatment_base_items p
       set used_quantity = p.used_quantity + b.menge
    from (
      select treatment_base_item_id, sum(quantity)::smallint as menge
      from public.billable_services
      where appointment_id = p_appointment_id and treatment_base_item_id is not null
      group by treatment_base_item_id
    ) b
    where p.id = b.treatment_base_item_id;
  exception
    when check_violation then
      raise exception 'treatment basis quantity exhausted' using errcode = '23514';
  end;


  return v_anzahl;
end;
$function$;

CREATE OR REPLACE FUNCTION public.record_call_outcome(p_appointment_id uuid, p_outcome text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor   uuid;
  v_org     uuid;
  v_patient uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.can_update_appointment() then
    raise exception 'not allowed to update appointments' using errcode = '42501';
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to update appointments' using errcode = '42501';
  end if;
  if p_outcome is null or p_outcome not in ('reached', 'not_reached', 'voicemail', 'cleared') then
    raise exception 'unknown call outcome' using errcode = '22023';
  end if;

  select a.patient_id into v_patient
  from public.appointments a
  where a.id = p_appointment_id
    and a.organization_id = v_org
    and a.kind = 'therapy'
    and a.patient_id is not null
  for update;

  if not found then
    raise exception 'appointment not found' using errcode = 'P0002';
  end if;

  if p_outcome = 'reached' then
    perform public.add_appointment_notification(array[p_appointment_id], 'phone');
    delete from public.appointment_call_states c where c.appointment_id = p_appointment_id;
  elsif p_outcome = 'cleared' then
    delete from public.appointment_call_states c where c.appointment_id = p_appointment_id;
  else
    insert into public.appointment_call_states
      (organization_id, appointment_id, outcome, attempts, recorded_by)
    values (v_org, p_appointment_id, p_outcome, 1, v_actor)
    on conflict (appointment_id) do update
      set outcome     = excluded.outcome,
          attempts    = least(public.appointment_call_states.attempts + 1, 99),
          recorded_at = now(),
          recorded_by = excluded.recorded_by;
  end if;

end;
$function$;

CREATE OR REPLACE FUNCTION public.record_no_show(p_appointment_id uuid, p_expected_updated_at timestamp with time zone, p_protocol_confirmed boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor    uuid;
  v_org      uuid;
  v_alt      record;
  v_protokoll boolean;
  v_anlass   text;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_record_no_show() then
    raise exception 'not allowed to record no-shows' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to record no-shows' using errcode = '42501';
  end if;

  if p_expected_updated_at is null then
    raise exception 'expected updated_at is required' using errcode = '22023';
  end if;

  select a.id, a.patient_id, a.staff_member_id, a.status, a.kind,
         a.appointment_type, a.updated_at
    into v_alt
  from public.appointments a
  where a.id = p_appointment_id
    and a.organization_id = v_org
    -- TRN-006: kein Durchgriff ueber den gemeinsamen Kalender (ADR-022 Punkt 11).
    and app.may_write_appointment_context(a.kind)
  for update;

  if not found then
    raise exception 'appointment not found' using errcode = 'P0002';
  end if;

  if v_alt.kind = 'internal' then
    raise exception 'event cannot be recorded as no-show' using errcode = '22023';
  end if;

  if v_alt.status = 'cancelled' then
    raise exception 'cancelled appointment cannot be recorded as no-show' using errcode = '22023';
  end if;

  if v_alt.status = 'no_show' then
    raise exception 'appointment is already recorded as no-show' using errcode = '22023';
  end if;

  if v_alt.status <> 'confirmed' then
    raise exception 'completed appointment must be reopened first' using errcode = '22023';
  end if;

  -- Wo dokumentiert wurde, hat eine Behandlung stattgefunden. Der Vermerk
  -- waere ein Widerspruch zum Nachweis - und wuerde die Invariante aus
  -- ADR-018 Punkt 3 aushebeln.
  if exists (
    select 1 from public.treatment_notes t where t.appointment_id = p_appointment_id
  ) then
    raise exception 'documented appointment cannot be recorded as no-show' using errcode = '22023';
  end if;

  if v_alt.kind <> 'therapy' then
    -- Der Trainingstermin: Vermerk ja, Forderung nein. Das Protokoll aus
    -- ANN-055 traegt den Anlass; ohne Anlass hat es nichts zu bestaetigen.
    if p_protocol_confirmed is true then
      raise exception 'no-show protocol applies to treatment appointments only'
        using errcode = '22023';
    end if;
    v_protokoll := false;
    v_anlass    := null;

  -- Das Protokoll ist ein Hausbesuchsprotokoll (ANN-055). An der Praxistuer
  -- gibt es nichts zu klingeln, und eine Bestaetigung, die niemand geben
  -- kann, waere hier die Grundlage einer Forderung.
  elsif v_alt.appointment_type = 'home_visit' then
    if p_protocol_confirmed is not true then
      raise exception 'no-show protocol must be confirmed for home visits'
        using errcode = '22023';
    end if;
    v_protokoll := true;
    v_anlass    := 'no_show';
  else
    if p_protocol_confirmed is true then
      raise exception 'no-show protocol applies to home visits only'
        using errcode = '22023';
    end if;
    v_protokoll := false;
    v_anlass    := null;
  end if;

  if v_alt.updated_at is distinct from p_expected_updated_at then
    raise exception 'appointment was changed meanwhile' using errcode = '40001';
  end if;

  update public.appointments
     set status                    = 'no_show',
         no_show_recorded_at       = now(),
         no_show_recorded_by       = v_actor,
         no_show_protocol_confirmed = v_protokoll,
         fee_basis                 = v_anlass,
         updated_at                = now()
   where id = p_appointment_id
     and updated_at = p_expected_updated_at
     and status = 'confirmed';

  if not found then
    raise exception 'appointment was changed meanwhile' using errcode = '40001';
  end if;


  return p_appointment_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.record_patient_privacy_entry(p_patient_id uuid, p_record_kind text, p_purpose text, p_notice_version text, p_occurred_on date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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


  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.record_payment(p_invoice_id uuid, p_amount_cents integer, p_paid_on date, p_method text, p_direction text DEFAULT 'incoming'::text, p_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor     uuid;
  v_org       uuid;
  v_invoice   record;
  v_zeitzone  text;
  v_heute     date;
  v_eingang   integer;
  v_rueck     integer;
  v_id        uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_manage_invoicing() then
    raise exception 'not allowed to manage invoices' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();

  select i.* into v_invoice
  from public.invoices i
  where i.id = p_invoice_id and i.organization_id = v_org
  for update;

  if not found then
    raise exception 'invoice not found' using errcode = '42501';
  end if;

  if v_invoice.status <> 'issued' then
    raise exception 'a payment belongs to an issued invoice' using errcode = '23514';
  end if;

  -- Eine stornierte Rechnung ist keine Forderung mehr und nimmt keinen
  -- Eingang an. Seit ABN-008 (BEF-100) nimmt sie eine RUECKZAHLUNG an: Der
  -- vor dem Storno eingegangene Betrag geht tatsaechlich zurueck. Die
  -- Verrechnung mit der Ersatzrechnung laeuft ueber offset_payment.
  if coalesce(p_direction, 'incoming') = 'incoming' and exists (
    select 1 from public.invoice_cancellations c where c.invoice_id = p_invoice_id
  ) then
    raise exception 'a cancelled invoice takes no payment' using errcode = '23514';
  end if;

  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'a payment needs a positive amount' using errcode = '22023';
  end if;

  if p_direction is null or p_direction not in ('incoming', 'refund') then
    raise exception 'unknown payment direction' using errcode = '22023';
  end if;

  if p_method is null or p_method not in ('bank_transfer', 'other') then
    raise exception 'unknown payment method' using errcode = '22023';
  end if;

  select o.time_zone into v_zeitzone from public.organizations o where o.id = v_org;
  v_heute := (now() at time zone v_zeitzone)::date;

  -- Kein Datum in der Zukunft: Eine Zahlung wird erfasst, wenn sie da ist,
  -- nicht wenn sie erwartet wird. Ein erwarteter Eingang ist ein offener
  -- Posten, und den fuehrt die Rechnung selbst.
  if p_paid_on is null or p_paid_on > v_heute then
    raise exception 'a payment cannot be dated in the future' using errcode = '22023';
  end if;

  -- Rueckgezahlt werden kann hoechstens, was eingegangen ist. Ueberzahlung
  -- dagegen bleibt erlaubt: ADR-009 nennt sie ausdruecklich (Konsequenz zu
  -- Punkt 12), und eine Rechnung, die zu viel Geld bekommen hat, ist ein
  -- Sachverhalt und kein Eingabefehler.
  if p_direction = 'refund' then
    select coalesce(sum(case when p.direction = 'incoming' then p.amount_cents else 0 end), 0),
           coalesce(sum(case when p.direction = 'refund'   then p.amount_cents else 0 end), 0)
      into v_eingang, v_rueck
    from public.payments p
    where p.invoice_id = p_invoice_id and p.voided_at is null;

    if v_rueck + p_amount_cents > v_eingang then
      raise exception 'a refund cannot exceed the payments received'
        using errcode = '23514';
    end if;
  end if;

  insert into public.payments (
    organization_id, invoice_id, direction, amount_cents, currency,
    paid_on, method, note, created_by
  )
  values (
    v_org, p_invoice_id, p_direction, p_amount_cents, v_invoice.currency,
    p_paid_on, p_method, nullif(btrim(coalesce(p_note, '')), ''), v_actor
  )
  returning id into v_id;


  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.redeem_platform_invitation(p_code_hash text, p_user_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_inv    record;
begin
  if p_user_id is null then
    raise exception 'invitation not valid' using errcode = '22023';
  end if;

  select i.id, i.purpose, i.organization_id, a.id as access_id, a.status as access_status,
         a.account_user_id
    into v_inv
  from public.platform_access_invitations i
  join public.platform_accesses a on a.id = i.platform_access_id
  where i.code_hash = lower(p_code_hash)
    and i.status = 'pending'
    and i.expires_at > now()
  for update of i, a;

  if v_inv.id is null
     or (v_inv.purpose = 'activate' and v_inv.access_status <> 'invited')
     or (v_inv.purpose = 'reset' and (v_inv.access_status <> 'active'
                                      or v_inv.account_user_id is distinct from p_user_id)) then
    raise exception 'invitation not valid' using errcode = '22023';
  end if;

  if v_inv.purpose = 'activate' then
    -- Der Riegel am Zugang prueft Praxiskonto und Person (Punkte 2 und 4).
    -- ANN-191: Das Konto hat der Zugangsdienst angelegt oder per Kennwort
    -- bestaetigt; seine Adresse darf von der im Verhaeltnis abweichen.
    update public.platform_accesses
       set status = 'active', account_user_id = p_user_id, activated_at = now()
     where id = v_inv.access_id;
  else
    -- Zweitreview: Das neue Kennwort setzt der Dienst erst NACH diesem
    -- Aufruf; der Code ist dann verbraucht, ein zweiter Aufruf scheitert.
    -- Laufende Sitzungen des Kontos enden hier: Wer das alte Kennwort
    -- kannte, bleibt nicht angemeldet (ADR-023 Punkt 18).
    if to_regclass('auth.sessions') is not null then
      execute 'delete from auth.sessions where user_id = $1' using p_user_id;
    end if;
  end if;

  update public.platform_access_invitations
     set status = 'redeemed', redeemed_at = now()
   where id = v_inv.id;

  -- LOG-EPIC-001: protokolliert wird die Aktivierung; ein neues Kennwort
  -- weist die Einladung selbst nach (created_by, redeemed_at).
  if v_inv.purpose = 'activate' then
    perform app.log_platform_access_event(
      v_inv.organization_id, p_user_id, 'platform', 'platform_access.activated',
      v_inv.access_id, jsonb_build_object('surface', 'platform')
    );
  end if;

  return v_inv.access_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.release_legal_hold(p_hold_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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


  -- Punkt 36: Was der Hold gesperrt gehalten hat, faellt, sobald er endet -
  -- nicht erst im naechsten Loeschlauf.
  perform app.delete_due_patient_photos(
    v_org, v_subject, extensions.gen_random_uuid(), v_actor, 'legal_hold_released'
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.remove_patient_course_event(p_event_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor   uuid;
  v_org     uuid;
  v_patient uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.can_write_questionnaire_response() then
    raise exception 'not allowed to record course events' using errcode = '42501';
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to record course events' using errcode = '42501';
  end if;

  -- ABN-013: Die Zeile bleibt; ein schon entferntes Ereignis gilt als nicht gefunden.
  update public.patient_course_events e
     set removed_at = now(), removed_by = v_actor
   where e.id = p_event_id and e.organization_id = v_org and e.removed_at is null
  returning e.patient_id into v_patient;

  if v_patient is null then
    raise exception 'course event not found' using errcode = 'P0002';
  end if;

end;
$function$;

CREATE OR REPLACE FUNCTION public.remove_territory(p_territory_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid;
  v_org   uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.can_manage_working_hours() then
    raise exception 'not allowed to write territories' using errcode = '42501';
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to write territories' using errcode = '42501';
  end if;

  delete from public.territories t where t.id = p_territory_id and t.organization_id = v_org;
  if not found then
    raise exception 'territory not found' using errcode = 'P0002';
  end if;

end;
$function$;

CREATE OR REPLACE FUNCTION public.reopen_appointment(p_appointment_id uuid, p_expected_updated_at timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid;
  v_org   uuid;
  v_alt   record;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- TRN-010 (ANN-186): dieselbe Rollenmenge wie beim Abschliessen.
  if not (app.can_reopen_appointment() or app.can_write_training_relationships()) then
    raise exception 'not allowed to reopen appointments' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to reopen appointments' using errcode = '42501';
  end if;

  if p_expected_updated_at is null then
    raise exception 'expected updated_at is required' using errcode = '22023';
  end if;

  select a.id, a.patient_id, a.staff_member_id, a.status, a.updated_at,
         a.kind, a.training_relationship_id
    into v_alt
  from public.appointments a
  where a.id = p_appointment_id
    and a.organization_id = v_org
    -- TRN-006: kein Durchgriff ueber den gemeinsamen Kalender (ADR-022 Punkt 11).
    and app.may_write_appointment_context(a.kind)
  for update;

  if not found then
    raise exception 'appointment not found' using errcode = 'P0002';
  end if;

  if v_alt.status = 'cancelled' then
    raise exception 'cancelled appointment cannot be reopened' using errcode = '22023';
  end if;

  -- 'documented' und 'invoiced' haben keinen Rueckweg: korrigiert wird in der
  -- Dokumentation beziehungsweise ueber den Rechnungsstorno (ADR-018 Punkt 2).
  if v_alt.status not in ('completed', 'no_show') then
    raise exception 'appointment is not completed' using errcode = '22023';
  end if;

  -- Eine erfasste Leistung haengt an diesem Termin und an seinem Zustand
  -- (ABR-002): Das Ausfallhonorar entsteht aus dem Gebuehrenanlass, die
  -- Behandlung aus 'dokumentiert'. Wer den Termin zurueckdreht, ohne die
  -- Leistung zu entfernen, laesst eine Forderung ohne Anlass stehen. Der Weg
  -- zurueck bleibt offen - er fuehrt ueber delete_billable_services.
  if exists (
    select 1 from public.billable_services b where b.appointment_id = p_appointment_id
  ) then
    raise exception 'billable services recorded, remove them first' using errcode = '23514';
  end if;

  if v_alt.updated_at is distinct from p_expected_updated_at then
    raise exception 'appointment was changed meanwhile' using errcode = '40001';
  end if;

  update public.appointments
     set status                     = 'confirmed',
         completed_at               = null,
         completed_by               = null,
         no_show_recorded_at        = null,
         no_show_recorded_by        = null,
         no_show_protocol_confirmed = null,
         fee_basis                  = null,
         -- LOG-EPIC-001: die Ruecknahme steht im Datenmodell, nicht im Log.
         reopened_at                = now(),
         reopened_by                = v_actor,
         updated_at                 = now()
   where id = p_appointment_id
     and updated_at = p_expected_updated_at
     and status in ('completed', 'no_show');

  if not found then
    raise exception 'appointment was changed meanwhile' using errcode = '40001';
  end if;


  return p_appointment_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.reopen_patient_care(p_patient_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    v_org, p_patient_id, extensions.gen_random_uuid(), v_actor, 'care_reopened'
  );

  update public.patients
     set care_concluded_on = null,
         care_concluded_at = null,
         care_concluded_by = null
   where id = p_patient_id;

end;
$function$;

CREATE OR REPLACE FUNCTION public.reopen_training_relationship(p_relationship_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor  uuid;
  v_org    uuid;
  v_bisher date;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.can_write_training_relationships() then
    perform app.record_denied_write(v_actor, 'training_relationship.reopened', 'not allowed to manage training clients');
    return null;
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to manage training clients' using errcode = '42501';
  end if;

  select t.contract_ended_on into v_bisher
  from public.training_relationships t
  where t.id = p_relationship_id and t.organization_id = v_org
  for update;
  if not found then
    raise exception 'training relationship not found' using errcode = 'P0002';
  end if;
  if v_bisher is null then
    raise exception 'training relationship has not ended' using errcode = '22023';
  end if;

  -- Wer nach einer Pause weitertrainiert, bekommt kein zweites Verhaeltnis
  -- (LEI-001): Das Ende wird geraeumt, die Frist laeuft nicht mehr.
  update public.training_relationships
     set contract_ended_on = null, status = 'active'
   where id = p_relationship_id;


  return p_relationship_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.revise_treatment_note(p_note_id uuid, p_expected_updated_at timestamp with time zone, p_content text, p_reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor     uuid;
  v_org       uuid;
  v_inhalt    text;
  v_grund     text;
  v_alt       record;
  v_patient   uuid;
  v_version   integer;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_write_treatment_note() then
    raise exception 'not allowed to write treatment documentation' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to write treatment documentation' using errcode = '42501';
  end if;

  if p_expected_updated_at is null then
    raise exception 'expected updated_at is required' using errcode = '22023';
  end if;

  v_inhalt := btrim(coalesce(p_content, ''), E' \t\r\n');

  if v_inhalt = '' then
    raise exception 'documentation must not be empty' using errcode = '22023';
  end if;

  if length(v_inhalt) > 20000 then
    raise exception 'documentation is too long' using errcode = '22023';
  end if;

  v_grund := btrim(coalesce(p_reason, ''), E' \t\r\n');

  if v_grund = '' then
    raise exception 'change reason is required' using errcode = '22023';
  end if;

  if length(v_grund) > 500 then
    raise exception 'change reason is too long' using errcode = '22023';
  end if;

  select t.id, t.appointment_id, t.content, t.status, t.updated_at
    into v_alt
  from public.treatment_notes t
  where t.id = p_note_id
    and t.organization_id = v_org
  for update;

  if not found then
    raise exception 'treatment note not found' using errcode = 'P0002';
  end if;

  if v_alt.status <> 'final' then
    raise exception 'treatment note is not final' using errcode = '22023';
  end if;

  if v_alt.updated_at is distinct from p_expected_updated_at then
    raise exception 'treatment note was changed meanwhile' using errcode = '40001';
  end if;

  -- Eine Korrektur ohne Aenderung ist keine Korrektur. Sie waere eine Version
  -- ohne Aussage und wuerde den Verlauf verwaessern, den ADR-016 lesbar halten
  -- will.
  if v_alt.content = v_inhalt then
    raise exception 'documentation is unchanged' using errcode = '22023';
  end if;

  select coalesce(max(v.version_no), 0) + 1
    into v_version
  from public.treatment_note_versions v
  where v.note_id = p_note_id;

  insert into public.treatment_note_versions (
    organization_id, note_id, version_no, content, change_reason, author_id
  )
  values (
    v_org, p_note_id, v_version, v_inhalt, v_grund, v_actor
  );

  update public.treatment_notes
     set content    = v_inhalt,
         updated_at = now(),
         updated_by = v_actor
   where id = p_note_id
     and updated_at = p_expected_updated_at;

  if not found then
    raise exception 'treatment note was changed meanwhile' using errcode = '40001';
  end if;

  select a.patient_id into v_patient
  from public.appointments a
  where a.id = v_alt.appointment_id;


  return p_note_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.save_invoice_recipient(p_id uuid, p_patient_id uuid, p_recipient_kind text, p_name text, p_street text, p_house_number text, p_postal_code text, p_city text, p_reference text, p_is_default boolean)
 RETURNS uuid
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

  if not app.can_manage_invoicing() then
    raise exception 'not allowed to manage invoice recipients' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();

  if not exists (
    select 1 from public.patients p
    where p.id = p_patient_id and p.organization_id = v_org
  ) then
    raise exception 'patient not found' using errcode = '42501';
  end if;

  -- Zuerst die alte Vorgabe raeumen, sonst schlaegt der Teilindex zu, bevor
  -- die neue Zeile steht.
  if coalesce(p_is_default, false) then
    update public.invoice_recipients
       set is_default = false, updated_at = now(), updated_by = v_actor
     where patient_id = p_patient_id
       and is_default
       and (p_id is null or id <> p_id);
  end if;

  if p_id is null then
    insert into public.invoice_recipients (
      organization_id, patient_id, recipient_kind, name,
      street, house_number, postal_code, city, reference, is_default,
      created_by, updated_by
    )
    values (
      v_org, p_patient_id, p_recipient_kind, btrim(p_name),
      nullif(btrim(p_street), ''), nullif(btrim(p_house_number), ''),
      nullif(btrim(p_postal_code), ''), nullif(btrim(p_city), ''),
      nullif(btrim(p_reference), ''), coalesce(p_is_default, false),
      v_actor, v_actor
    )
    returning id into v_id;
  else
    update public.invoice_recipients
       set recipient_kind = p_recipient_kind,
           name           = btrim(p_name),
           street         = nullif(btrim(p_street), ''),
           house_number   = nullif(btrim(p_house_number), ''),
           postal_code    = nullif(btrim(p_postal_code), ''),
           city           = nullif(btrim(p_city), ''),
           reference      = nullif(btrim(p_reference), ''),
           is_default     = coalesce(p_is_default, false),
           updated_at     = now(),
           updated_by     = v_actor
     where id = p_id
       and organization_id = v_org
       and patient_id = p_patient_id
    returning id into v_id;

    if v_id is null then
      raise exception 'invoice recipient not found' using errcode = '42501';
    end if;
  end if;


  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.save_practice_billing_profile(p_legal_name text, p_street text, p_house_number text, p_postal_code text, p_city text, p_phone text, p_email text, p_tax_number text, p_vat_id text, p_small_business boolean, p_bank_name text, p_account_holder text, p_iban text, p_bic text, p_invoice_number_prefix text, p_payment_term_days smallint, p_training_invoice_number_prefix text DEFAULT 'TR'::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor    uuid;
  v_org      uuid;
  v_neu      boolean;
  v_prefix   text;
  v_training text;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_manage_billing_profile() then
    raise exception 'not allowed to manage the billing profile' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();

  -- ABN-008 (BEF-100): Steuernummer ODER USt-IdNr. (Par. 14 Abs. 4 Nr. 2
  -- UStG). Die Tabelle haelt dieselbe Zusage; hier steht sie mit einer
  -- Meldung, die sagt, was fehlt.
  if nullif(btrim(coalesce(p_tax_number, '')), '') is null
     and nullif(btrim(coalesce(p_vat_id, '')), '') is null then
    raise exception 'a tax number or a vat id is required' using errcode = '22023';
  end if;

  if p_small_business is null then
    raise exception 'the vat status must be stated explicitly' using errcode = '22023';
  end if;

  -- Die IBAN wird geprueft, bevor sie in den Snapshot jeder spaeteren
  -- Rechnung wandert (ADR-009 Punkt 10). Die Tabelle haelt dieselbe Zusage;
  -- hier steht sie, damit die Meldung sagt, was zu tun ist.
  if not app.iban_checksum_ok(p_iban) then
    raise exception 'the iban checksum does not match' using errcode = '22023';
  end if;

  v_prefix   := coalesce(upper(nullif(btrim(p_invoice_number_prefix), '')), 'RG');
  v_training := coalesce(upper(nullif(btrim(p_training_invoice_number_prefix), '')), 'TR');

  -- Dieselbe Zusage wie die Constraint, nur mit einer Meldung, die sagt, was
  -- zu tun ist (ADR-009 Punkt 17).
  if v_prefix = v_training then
    raise exception 'the two invoice number prefixes must differ' using errcode = '22023';
  end if;

  v_neu := not exists (
    select 1 from public.practice_billing_profiles where organization_id = v_org
  );

  insert into public.practice_billing_profiles as b (
    organization_id, legal_name, street, house_number, postal_code, city,
    phone, email, tax_number, vat_id, small_business,
    bank_name, account_holder, iban, bic,
    invoice_number_prefix, training_invoice_number_prefix, payment_term_days,
    created_by, updated_by
  )
  values (
    v_org,
    btrim(p_legal_name), btrim(p_street), nullif(btrim(p_house_number), ''),
    btrim(p_postal_code), btrim(p_city),
    nullif(btrim(p_phone), ''), nullif(btrim(p_email), ''),
    nullif(btrim(p_tax_number), ''), nullif(btrim(p_vat_id), ''), p_small_business,
    nullif(btrim(p_bank_name), ''), nullif(btrim(p_account_holder), ''),
    -- Die IBAN steht auf dem Papier mit Leerzeichen und in der Datenbank ohne.
    upper(replace(btrim(p_iban), ' ', '')),
    upper(nullif(btrim(p_bic), '')),
    v_prefix, v_training,
    coalesce(p_payment_term_days, 14::smallint),
    v_actor, v_actor
  )
  on conflict (organization_id) do update set
    legal_name                    = excluded.legal_name,
    street                        = excluded.street,
    house_number                  = excluded.house_number,
    postal_code                   = excluded.postal_code,
    city                          = excluded.city,
    phone                         = excluded.phone,
    email                         = excluded.email,
    tax_number                    = excluded.tax_number,
    vat_id                        = excluded.vat_id,
    small_business                = excluded.small_business,
    bank_name                     = excluded.bank_name,
    account_holder                = excluded.account_holder,
    iban                          = excluded.iban,
    bic                           = excluded.bic,
    invoice_number_prefix         = excluded.invoice_number_prefix,
    training_invoice_number_prefix = excluded.training_invoice_number_prefix,
    payment_term_days             = excluded.payment_term_days,
    updated_at                    = now(),
    updated_by                    = v_actor
  where b.organization_id = v_org;

end;
$function$;

CREATE OR REPLACE FUNCTION public.save_questionnaire_response(p_patient_id uuid, p_response_id uuid, p_instrument_id text, p_definition_version text, p_recorded_on date, p_answers jsonb, p_supersedes_response_id uuid DEFAULT NULL::uuid, p_change_reason text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor    uuid;
  v_org      uuid;
  v_zone     text;
  v_alt      record;
  v_id       uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_write_questionnaire_response() then
    raise exception 'not allowed to record questionnaires' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to record questionnaires' using errcode = '42501';
  end if;

  -- Eine fremde Akte und eine nicht vorhandene sehen gleich aus (ADR-003).
  perform 1 from public.patients p
  where p.id = p_patient_id and p.organization_id = v_org;
  if not found then
    raise exception 'patient not found' using errcode = 'P0002';
  end if;

  if p_recorded_on is null then
    raise exception 'date is required' using errcode = '22023';
  end if;
  select o.time_zone into v_zone from public.organizations o where o.id = v_org;
  if p_recorded_on > (now() at time zone coalesce(v_zone, 'Europe/Berlin'))::date then
    raise exception 'date lies in the future' using errcode = '22023';
  end if;

  -- ABN-014 (BEF-101): Form, dann Inhalt gegen die Definition dieser Fassung.
  perform app.assert_questionnaire_answers(p_instrument_id, p_definition_version, p_answers);

  if p_response_id is not null then
    select r.status, r.patient_id, r.instrument_id, r.definition_version,
           r.supersedes_response_id, r.recorded_on
      into v_alt
    from public.patient_questionnaire_responses r
    where r.id = p_response_id and r.organization_id = v_org
    for update;

    if not found or v_alt.patient_id <> p_patient_id then
      raise exception 'questionnaire response not found' using errcode = 'P0002';
    end if;
    if v_alt.status <> 'entwurf' then
      raise exception 'questionnaire response is completed' using errcode = '23514';
    end if;
    -- Was ein Entwurf festhaelt, laesst sich beim Ueberschreiben nicht
    -- aendern - und wird dann abgewiesen statt still uebergangen.
    if v_alt.instrument_id <> p_instrument_id
       or v_alt.definition_version <> p_definition_version
       or p_supersedes_response_id is not null
       or p_change_reason is not null then
      raise exception 'draft identity is fixed' using errcode = '22023';
    end if;
    -- ABN-014: Eine Korrektur bleibt am Erhebungstag der korrigierten.
    if v_alt.supersedes_response_id is not null and p_recorded_on <> v_alt.recorded_on then
      raise exception 'a correction keeps the date of the original' using errcode = '22023';
    end if;

    update public.patient_questionnaire_responses
       set answers     = p_answers,
           recorded_on = p_recorded_on,
           updated_at  = now(),
           updated_by  = v_actor
     where id = p_response_id;


    return p_response_id;
  end if;

  if p_supersedes_response_id is not null then
    select r.status, r.patient_id, r.instrument_id, r.recorded_on
      into v_alt
    from public.patient_questionnaire_responses r
    where r.id = p_supersedes_response_id and r.organization_id = v_org
    for update;

    if not found or v_alt.patient_id <> p_patient_id then
      raise exception 'questionnaire response not found' using errcode = 'P0002';
    end if;
    if v_alt.status <> 'abgeschlossen' then
      raise exception 'only a completed questionnaire can be corrected' using errcode = '23514';
    end if;
    if v_alt.instrument_id <> p_instrument_id then
      raise exception 'correction must use the same instrument' using errcode = '23514';
    end if;
    -- ABN-014 (BEF-101 Punkt 2): Erhebungstag und Korrekturzeitpunkt sind
    -- getrennt. Der Tag bleibt der der korrigierten Erhebung; wann korrigiert
    -- wurde, sagt created_at.
    if p_recorded_on <> v_alt.recorded_on then
      raise exception 'a correction keeps the date of the original' using errcode = '22023';
    end if;
    if p_change_reason is null or length(btrim(p_change_reason)) < 3 then
      raise exception 'a correction needs a reason' using errcode = '22023';
    end if;
    if exists (
      select 1 from public.patient_questionnaire_responses r
      where r.supersedes_response_id = p_supersedes_response_id
    ) then
      raise exception 'questionnaire response already corrected' using errcode = '23505';
    end if;
  elsif p_change_reason is not null then
    raise exception 'a reason belongs to a correction' using errcode = '22023';
  end if;

  -- Kennung und Version pruefen die Constraints der Tabelle.
  insert into public.patient_questionnaire_responses (
    organization_id, patient_id, instrument_id, definition_version, recorded_on, answers,
    supersedes_response_id, change_reason, created_by, updated_by
  )
  values (
    v_org, p_patient_id, p_instrument_id, p_definition_version, p_recorded_on, p_answers,
    p_supersedes_response_id, nullif(btrim(p_change_reason), ''), v_actor, v_actor
  )
  returning id into v_id;


  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.save_territory(p_territory_id uuid, p_expected_updated_at timestamp with time zone, p_name text, p_postal_codes text[], p_day_parts jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor  uuid;
  v_org    uuid;
  v_id     uuid;
  v_stand  timestamptz;
  v_codes  text[];
  v_belegt text;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.can_manage_working_hours() then
    raise exception 'not allowed to write territories' using errcode = '42501';
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to write territories' using errcode = '42501';
  end if;

  if p_name is null or length(btrim(p_name)) not between 1 and 60 then
    raise exception 'invalid name' using errcode = '22023';
  end if;
  if not app.territory_day_parts_valid(coalesce(p_day_parts, '[]'::jsonb)) then
    raise exception 'invalid day parts' using errcode = '22023';
  end if;

  select coalesce(array_agg(distinct btrim(c) order by btrim(c)), array[]::text[])
    into v_codes
  from unnest(coalesce(p_postal_codes, array[]::text[])) c
  where btrim(c) <> '';
  if cardinality(v_codes) > 200 then
    raise exception 'too many postal codes' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(v_codes) c where c !~ '^[0-9]{5}$') then
    raise exception 'invalid postal code' using errcode = '22023';
  end if;

  if p_territory_id is null then
    begin
      insert into public.territories (organization_id, name, day_parts, created_by, updated_by)
      values (v_org, btrim(p_name), coalesce(p_day_parts, '[]'::jsonb), v_actor, v_actor)
      returning id into v_id;
    exception
      when unique_violation then
        raise exception 'territory name taken' using errcode = '23505';
    end;
  else
    select t.updated_at into v_stand
    from public.territories t
    where t.id = p_territory_id and t.organization_id = v_org
    for update;
    if not found then
      raise exception 'territory not found' using errcode = 'P0002';
    end if;
    if p_expected_updated_at is null or v_stand <> p_expected_updated_at then
      raise exception 'territory changed' using errcode = '40001';
    end if;
    begin
      update public.territories t
         set name       = btrim(p_name),
             day_parts  = coalesce(p_day_parts, '[]'::jsonb),
             updated_at = clock_timestamp(),
             updated_by = v_actor
       where t.id = p_territory_id;
    exception
      when unique_violation then
        raise exception 'territory name taken' using errcode = '23505';
    end;
    v_id := p_territory_id;
    delete from public.territory_postal_codes pc where pc.territory_id = v_id;
  end if;

  -- Eine Postleitzahl, die schon einem anderen Gebiet gehoert, wird genannt:
  -- Sie ist eine Praxisregel und kein Personendatum.
  select pc.postal_code into v_belegt
  from public.territory_postal_codes pc
  where pc.organization_id = v_org
    and pc.postal_code = any (v_codes)
  order by pc.postal_code
  limit 1;
  if v_belegt is not null then
    raise exception 'postal code already assigned: %', v_belegt using errcode = '23505';
  end if;

  insert into public.territory_postal_codes (organization_id, territory_id, postal_code)
  select v_org, v_id, c from unnest(v_codes) c;


  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.save_training_protocol(p_appointment_id uuid, p_content text, p_expected_updated_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(id uuid, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor    uuid;
  v_org      uuid;
  v_inhalt   text;
  v_termin   record;
  v_protokoll record;
  v_id       uuid;
  v_stand    timestamptz;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.can_access_training_protocols() then
    perform app.record_denied_write(v_actor, 'training_protocol.updated', 'not allowed to write training protocols');
    return;
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to write training protocols' using errcode = '42501';
  end if;

  v_inhalt := btrim(coalesce(p_content, ''), E' \t\r\n');
  if v_inhalt = '' then
    raise exception 'training protocol must not be empty' using errcode = '22023';
  end if;
  if length(v_inhalt) > 20000 then
    raise exception 'training protocol is too long' using errcode = '22023';
  end if;

  select a.id, a.status, a.training_relationship_id
    into v_termin
  from public.appointments a
  where a.id = p_appointment_id
    and a.organization_id = v_org
    and a.kind = 'training'
  for update;

  if not found then
    raise exception 'appointment not found' using errcode = 'P0002';
  end if;

  if v_termin.status = 'cancelled' then
    raise exception 'cancelled appointment cannot be protocolled' using errcode = '22023';
  end if;
  if v_termin.status = 'no_show' then
    raise exception 'no-show appointment cannot be protocolled' using errcode = '22023';
  end if;

  select p.id, p.status, p.updated_at
    into v_protokoll
  from public.training_protocols p
  where p.appointment_id = p_appointment_id
  for update;

  -- IF und RAISE lassen FOUND stehen; das "if not found" unten liest weiter
  -- das Ergebnis der Abfrage oben.
  if found and v_protokoll.status = 'final' then
    raise exception 'finalized training protocol cannot be changed' using errcode = '22023';
  end if;

  -- Zweitreview 2: Ein Entwurf entsteht nur am bestaetigten oder
  -- durchgefuehrten Termin - nie an einem dokumentierten, dessen Protokoll
  -- der Loeschlauf genommen hat (ANN-183).
  if v_termin.status not in ('confirmed', 'completed') then
    raise exception 'appointment cannot be protocolled' using errcode = '22023';
  end if;

  if not found then
    begin
      insert into public.training_protocols (
        organization_id, training_relationship_id, appointment_id, status, content,
        created_by, updated_by
      )
      values (
        v_org, v_termin.training_relationship_id, p_appointment_id, 'draft', v_inhalt,
        v_actor, v_actor
      )
      returning training_protocols.id, training_protocols.updated_at into v_id, v_stand;
    exception
      when unique_violation then
        raise exception 'training protocol already exists' using errcode = '23505';
    end;


    return query select v_id, v_stand;
    return;
  end if;

  if v_protokoll.status = 'final' then
    raise exception 'finalized training protocol cannot be changed' using errcode = '22023';
  end if;

  if p_expected_updated_at is null then
    raise exception 'expected updated_at is required' using errcode = '22023';
  end if;
  if v_protokoll.updated_at is distinct from p_expected_updated_at then
    raise exception 'training protocol was changed meanwhile' using errcode = '40001';
  end if;

  update public.training_protocols p
     set content    = v_inhalt,
         updated_at = now(),
         updated_by = v_actor
   where p.id = v_protokoll.id
  returning p.updated_at into v_stand;


  return query select v_protokoll.id, v_stand;
end;
$function$;

CREATE OR REPLACE FUNCTION public.save_treatment_draft_findings(p_appointment_id uuid, p_findings jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor   uuid;
  v_org     uuid;
  v_termin  record;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.can_write_treatment_note() then
    raise exception 'not allowed to write treatment documentation' using errcode = '42501';
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to write treatment documentation' using errcode = '42501';
  end if;

  select a.id, a.patient_id, a.kind into v_termin
  from public.appointments a
  where a.id = p_appointment_id and a.organization_id = v_org;
  if not found then
    raise exception 'appointment not found' using errcode = 'P0002';
  end if;
  if v_termin.kind <> 'therapy' then
    raise exception 'only a treatment appointment can be documented' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.treatment_notes t
    where t.appointment_id = p_appointment_id and t.addendum_to_note_id is null
      and t.status <> 'draft'
  ) then
    raise exception 'documentation is already finalized' using errcode = '22023';
  end if;

  if p_findings is null or p_findings = '{}'::jsonb
     or (p_findings ? 'auswahl' and p_findings->'auswahl' = '{}'::jsonb) then
    delete from public.treatment_draft_findings f where f.appointment_id = p_appointment_id;
  else
    if jsonb_typeof(p_findings) <> 'object' or octet_length(p_findings::text) > 65536 then
      raise exception 'findings must be a small object' using errcode = '22023';
    end if;
    insert into public.treatment_draft_findings (organization_id, appointment_id, findings, updated_by)
    values (v_org, p_appointment_id, p_findings, v_actor)
    on conflict (appointment_id) do update
      set findings = excluded.findings, updated_at = now(), updated_by = v_actor;
  end if;

end;
$function$;

CREATE OR REPLACE FUNCTION public.set_appointment_grid(p_minutes smallint)
 RETURNS smallint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid;
  v_org   uuid;
  v_alt   smallint;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_change_appointment_grid() then
    raise exception 'not allowed to change the appointment grid' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to change the appointment grid' using errcode = '42501';
  end if;

  if p_minutes is null or p_minutes not in (5, 10, 15) then
    raise exception 'unsupported appointment grid' using errcode = '22023';
  end if;

  select o.appointment_grid_minutes into v_alt
  from public.organizations o
  where o.id = v_org
  for update;

  if not found then
    raise exception 'organization not found' using errcode = 'P0002';
  end if;

  -- Speichern ohne tatsaechliche Aenderung ist kein Vorgang.
  if v_alt = p_minutes then
    return v_alt;
  end if;

  update public.organizations
     set appointment_grid_minutes = p_minutes
   where id = v_org;


  return p_minutes;
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_appointment_notification(p_appointment_id uuid, p_channels text[])
 RETURNS text[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor    uuid;
  v_org      uuid;
  v_patient  uuid;
  v_kind     text;
  v_stand    timestamptz;
  v_kanaele  text[];
  v_kanal    text;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- Der Vermerk gehoert zur Terminorganisation und traegt dasselbe Recht wie
  -- das Aendern eines Termins (ADR-004).
  if not app.can_update_appointment() then
    raise exception 'not allowed to update appointments' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to update appointments' using errcode = '42501';
  end if;

  select a.patient_id, a.kind, a.patient_relevant_changed_at
    into v_patient, v_kind, v_stand
  from public.appointments a
  where a.id = p_appointment_id
    and a.organization_id = v_org
    -- TRN-006: kein Durchgriff ueber den gemeinsamen Kalender (ADR-022 Punkt 11).
    and app.may_write_appointment_context(a.kind)
  for update;

  if not found then
    raise exception 'appointment not found' using errcode = 'P0002';
  end if;

  if v_kind = 'internal' then
    raise exception 'event has nobody to notify' using errcode = '22023';
  end if;

  -- Doppelte Angaben sind kein Fehler, aber auch kein zweiter Vermerk.
  v_kanaele := (
    select coalesce(array_agg(distinct k order by k), array[]::text[])
    from unnest(coalesce(p_channels, array[]::text[])) as k
    where k is not null
  );

  foreach v_kanal in array v_kanaele loop
    if v_kanal not in ('slip', 'phone', 'in_person', 'email') then
      raise exception 'unknown notification channel' using errcode = '22023';
    end if;
  end loop;

  -- Nur die gueltigen Zeilen weichen; die aelteren bleiben als Historie.
  delete from public.appointment_notifications n
  where n.appointment_id = p_appointment_id
    and n.notified_at >= v_stand;

  insert into public.appointment_notifications
    (organization_id, appointment_id, channel, notified_by)
  select v_org, p_appointment_id, k, v_actor
  from unnest(v_kanaele) as k;


  return v_kanaele;
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_documentation_deadline(p_days smallint)
 RETURNS smallint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid;
  v_org   uuid;
  v_alt   smallint;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_change_documentation_deadline() then
    raise exception 'not allowed to change the documentation deadline' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to change the documentation deadline' using errcode = '42501';
  end if;

  if p_days is null or p_days < 0 or p_days > 30 then
    raise exception 'unsupported documentation deadline' using errcode = '22023';
  end if;

  select o.documentation_auto_finalize_days into v_alt
  from public.organizations o
  where o.id = v_org
  for update;

  if not found then
    raise exception 'organization not found' using errcode = 'P0002';
  end if;

  -- Speichern ohne tatsaechliche Aenderung ist kein Vorgang.
  if v_alt = p_days then
    return v_alt;
  end if;

  update public.organizations
     set documentation_auto_finalize_days = p_days
   where id = v_org;


  return p_days;
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_invoice_recipient(p_invoice_id uuid, p_recipient_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor   uuid;
  v_org     uuid;
  v_status  text;
  v_patient uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_manage_invoicing() then
    raise exception 'not allowed to manage invoices' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();

  select i.status, i.patient_id into v_status, v_patient
  from public.invoices i
  where i.id = p_invoice_id and i.organization_id = v_org
  for update;

  if not found then
    raise exception 'invoice not found' using errcode = '42501';
  end if;

  if v_status <> 'draft' then
    raise exception 'an issued invoice cannot be changed' using errcode = '23514';
  end if;

  -- Ein Empfaenger einer anderen Patientin waere die Falschzuordnung aus
  -- PROJECT_PRINCIPLES.md 13 - und zwar die teuerste: eine Rechnung mit
  -- fremden Leistungen an eine fremde Anschrift.
  if p_recipient_id is not null and not exists (
    select 1 from public.invoice_recipients r
    where r.id = p_recipient_id and r.patient_id = v_patient and r.organization_id = v_org
  ) then
    raise exception 'recipient does not belong to this patient' using errcode = '22023';
  end if;

  update public.invoices set recipient_id = p_recipient_id where id = p_invoice_id;

end;
$function$;

CREATE OR REPLACE FUNCTION public.set_location_tour_start(p_location_id uuid, p_street text, p_house_number text, p_postal_code text, p_city text, p_lat double precision, p_lon double precision, p_precision text, p_confirmed boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid;
  v_org   uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.has_any_role('owner') then
    raise exception 'not allowed to change the tour start' using errcode = '42501';
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to change the tour start' using errcode = '42501';
  end if;

  if nullif(btrim(p_street), '') is null
     or nullif(btrim(p_postal_code), '') is null
     or nullif(btrim(p_city), '') is null then
    raise exception 'street, postal code and city are required' using errcode = '22023';
  end if;

  perform app.assert_geocode_result(p_lat, p_lon, p_precision, p_confirmed);

  -- Adresse zuerst, dann die Koordinate: Der Trigger verwirft sie sonst im
  -- selben Schreibvorgang als "zur alten Adresse gehoerig".
  update public.locations l
     set street       = btrim(p_street),
         house_number = nullif(btrim(p_house_number), ''),
         postal_code  = btrim(p_postal_code),
         city         = btrim(p_city)
   where l.id = p_location_id
     and l.organization_id = v_org;

  if not found then
    raise exception 'location not found' using errcode = 'P0002';
  end if;

  update public.locations l
     set lat = p_lat,
         lon = p_lon,
         geocode_precision = p_precision
   where l.id = p_location_id;

end;
$function$;

CREATE OR REPLACE FUNCTION public.set_patient_address_coordinate(p_patient_id uuid, p_street text, p_house_number text, p_postal_code text, p_city text, p_lat double precision, p_lon double precision, p_precision text, p_confirmed boolean DEFAULT false)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor    uuid;
  v_org      uuid;
  v_termine  integer;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- Dasselbe Recht wie das Aendern der Adresse: Die Koordinate ist ein Teil
  -- von ihr (ANN-016).
  if not app.can_update_patient() then
    raise exception 'not allowed to update patients' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to update patients' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.patients p where p.id = p_patient_id and p.organization_id = v_org
  ) then
    raise exception 'patient not found' using errcode = 'P0002';
  end if;

  perform app.assert_geocode_result(p_lat, p_lon, p_precision, p_confirmed);

  update public.patient_contact_details c
     set lat = p_lat,
         lon = p_lon,
         geocode_precision = p_precision
   where c.patient_id = p_patient_id
     and c.organization_id = v_org
     and c.street is not null and c.postal_code is not null and c.city is not null
     and c.street       is not distinct from nullif(btrim(p_street), '')
     and c.house_number is not distinct from nullif(btrim(p_house_number), '')
     and c.postal_code  is not distinct from nullif(btrim(p_postal_code), '')
     and c.city         is not distinct from nullif(btrim(p_city), '');

  if not found then
    -- Die Adresse wurde zwischen Geocoding und Speichern geaendert (oder ist
    -- unvollstaendig): Eine Koordinate zu einer anderen Adresse wird nicht
    -- geschrieben.
    raise exception 'address changed since geocoding' using errcode = '40001';
  end if;

  update public.appointments a
     set visit_lat = p_lat,
         visit_lon = p_lon,
         visit_geocode_precision = p_precision
   where a.patient_id = p_patient_id
     and a.organization_id = v_org
     and a.appointment_type = 'home_visit'
     and a.starts_at >= now()
     and a.visit_street       is not distinct from nullif(btrim(p_street), '')
     and a.visit_house_number is not distinct from nullif(btrim(p_house_number), '')
     and a.visit_postal_code  is not distinct from nullif(btrim(p_postal_code), '')
     and a.visit_city         is not distinct from nullif(btrim(p_city), '');
  get diagnostics v_termine = row_count;


  return v_termine;
end;
$function$;

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

end;
$function$;

CREATE OR REPLACE FUNCTION public.set_patient_status(p_patient_id uuid, p_status text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid;
  v_org   uuid;
  v_alt   text;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- SECURITY DEFINER umgeht RLS, deshalb wird die Berechtigung hier selbst
  -- geprueft.
  if not app.can_change_patient_status() then
    raise exception 'not allowed to change patient status' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to change patient status' using errcode = '42501';
  end if;

  -- Nur die beiden fachlich definierten Zustaende. Die Pruefung steht hier
  -- zusaetzlich zur CHECK-Constraint, damit die Meldung verstaendlich bleibt.
  if p_status is null or p_status not in ('active', 'inactive') then
    raise exception 'unknown patient status' using errcode = '22023';
  end if;

  -- Zielpatient ausschliesslich in der Organisation des Aufrufers suchen: eine
  -- fremde ID ist damit von einer unbekannten nicht zu unterscheiden.
  select p.status into v_alt
  from public.patients p
  where p.id = p_patient_id
    and p.organization_id = v_org;

  if not found then
    raise exception 'patient not found' using errcode = 'P0002';
  end if;

  -- Kein Wechsel, kein Vorgang: weder Schreibzugriff noch Auditeintrag.
  if v_alt = p_status then
    return;
  end if;

  update public.patients
     set status = p_status
   where id = p_patient_id;

end;
$function$;

CREATE OR REPLACE FUNCTION public.set_practice_target(p_kpi text, p_value integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid;
  v_org   uuid;
  v_alt   integer;
  v_max   integer;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.can_read_practice_statistics() then
    raise exception 'not allowed to change practice targets' using errcode = '42501';
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to change practice targets' using errcode = '42501';
  end if;

  v_max := case p_kpi
    when 'revenue_cents'       then 100000000
    when 'open_items_cents'    then 100000000
    when 'utilization_percent' then 100
    when 'ending_bases'        then 10000
    when 'absences'            then 10000
  end;
  if v_max is null then
    raise exception 'unknown practice target' using errcode = '22023';
  end if;
  if p_value is not null and (p_value < 0 or p_value > v_max) then
    raise exception 'practice target out of range' using errcode = '22023';
  end if;

  -- Die Zeile sperren, falls es sie gibt; ohne Zeile ist jeder Zielwert leer.
  select case p_kpi
           when 'revenue_cents'       then t.revenue_cents
           when 'open_items_cents'    then t.open_items_cents
           when 'utilization_percent' then t.utilization_percent::integer
           when 'ending_bases'        then t.ending_bases
           when 'absences'            then t.absences
         end
    into v_alt
  from public.practice_targets t
  where t.organization_id = v_org
  for update;

  -- Speichern ohne tatsaechliche Aenderung ist kein Vorgang - und schreibt
  -- auch keine Zeile.
  if v_alt is not distinct from p_value then
    return p_value;
  end if;

  insert into public.practice_targets as t (
    organization_id, revenue_cents, open_items_cents, utilization_percent,
    ending_bases, absences, updated_at, updated_by
  )
  values (
    v_org,
    case when p_kpi = 'revenue_cents'       then p_value end,
    case when p_kpi = 'open_items_cents'    then p_value end,
    case when p_kpi = 'utilization_percent' then p_value::smallint end,
    case when p_kpi = 'ending_bases'        then p_value end,
    case when p_kpi = 'absences'            then p_value end,
    now(),
    v_actor
  )
  on conflict (organization_id) do update
     set revenue_cents       = case when p_kpi = 'revenue_cents'       then p_value else t.revenue_cents end,
         open_items_cents    = case when p_kpi = 'open_items_cents'    then p_value else t.open_items_cents end,
         utilization_percent = case when p_kpi = 'utilization_percent' then p_value::smallint else t.utilization_percent end,
         ending_bases        = case when p_kpi = 'ending_bases'        then p_value else t.ending_bases end,
         absences            = case when p_kpi = 'absences'            then p_value else t.absences end,
         updated_at          = now(),
         updated_by          = v_actor;


  return p_value;
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_staff_compensation_model(p_staff_member_id uuid, p_model text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid;
  v_org   uuid;
  v_alt   text;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.has_any_role('owner') then
    raise exception 'not allowed to change the compensation model' using errcode = '42501';
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to change the compensation model' using errcode = '42501';
  end if;
  if p_model is not null and p_model not in ('fixed_salary', 'revenue_share') then
    raise exception 'unknown compensation model' using errcode = '22023';
  end if;

  -- Die Person sperren: Sie muss zur Organisation gehoeren.
  perform 1 from public.staff_members sm
   where sm.id = p_staff_member_id and sm.organization_id = v_org
   for update;
  if not found then
    raise exception 'staff member not found' using errcode = 'P0002';
  end if;

  select m.model into v_alt
  from public.staff_compensation_models m
  where m.staff_member_id = p_staff_member_id
  for update;

  if v_alt is not distinct from p_model then
    return p_model;
  end if;

  if p_model is null then
    delete from public.staff_compensation_models where staff_member_id = p_staff_member_id;
  else
    insert into public.staff_compensation_models (staff_member_id, organization_id, model, changed_at, changed_by)
    values (p_staff_member_id, v_org, p_model, now(), v_actor)
    on conflict (staff_member_id) do update
       set model = excluded.model, changed_at = now(), changed_by = v_actor;
  end if;


  return p_model;
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_staff_employment_status(p_staff_member_id uuid, p_status text, p_acknowledge_future_appointments boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor  uuid;
  v_org    uuid;
  v_alt    text;
  v_offen  integer := 0;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_manage_staff_employment() then
    raise exception 'not allowed to manage staff' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to manage staff' using errcode = '42501';
  end if;

  if p_status is null or p_status not in ('active', 'inactive') then
    raise exception 'unknown employment status' using errcode = '22023';
  end if;

  -- FOR UPDATE ist hier nicht optional: die Sperre steht im Konflikt mit dem
  -- FOR-SHARE-Lock der Terminanlage. Erst danach wird gezaehlt, damit eine
  -- parallel angelegte Terminzuweisung in der Zaehlung enthalten ist.
  select sm.employment_status into v_alt
  from public.staff_members sm
  where sm.id = p_staff_member_id
    and sm.organization_id = v_org
  for update;

  if not found then
    raise exception 'staff member not found' using errcode = 'P0002';
  end if;

  -- Kein Wechsel, kein Vorgang: weder Schreibzugriff noch Auditeintrag.
  if v_alt = p_status then
    return;
  end if;

  if p_status = 'inactive' then
    v_offen := app.count_staff_future_appointments(p_staff_member_id, v_org);

    if v_offen > 0 and not coalesce(p_acknowledge_future_appointments, false) then
      -- Nichts geschrieben, nichts abgesagt, nichts umgebucht.
      raise exception 'staff_has_future_appointments' using errcode = '22023';
    end if;
  end if;

  update public.staff_members
     set employment_status = p_status
   where id = p_staff_member_id
     and organization_id = v_org;

end;
$function$;

CREATE OR REPLACE FUNCTION public.set_staff_member_schedulable(p_staff_member_id uuid, p_treatment boolean, p_training boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor     uuid;
  v_org       uuid;
  v_alt       record;
  v_geaendert text[] := array[]::text[];
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.can_manage_staff_accounts() then
    -- G6c: wie die uebrigen Schreibpfade fuer Konten abgewiesen - bestaetigter
    -- denied-Eintrag, HTTP 403, keine Ausnahme, nichts geaendert.
    perform app.record_denied_write(v_actor, 'staff_member.updated', 'not allowed to manage staff');
    return;
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to manage staff' using errcode = '42501';
  end if;
  if p_staff_member_id is null or p_treatment is null or p_training is null then
    raise exception 'staff member and both values are required' using errcode = '22023';
  end if;

  select sm.schedulable_treatment, sm.schedulable_training
    into v_alt
  from public.staff_members sm
  where sm.id = p_staff_member_id
    and sm.organization_id = v_org
  for update;

  if not found then
    raise exception 'staff member not found' using errcode = 'P0002';
  end if;

  if v_alt.schedulable_treatment is distinct from p_treatment then
    v_geaendert := array_append(v_geaendert, 'schedulable_treatment');
  end if;
  if v_alt.schedulable_training is distinct from p_training then
    v_geaendert := array_append(v_geaendert, 'schedulable_training');
  end if;

  -- Kein Unterschied, kein Ereignis (ADR-010).
  if array_length(v_geaendert, 1) is null then
    return;
  end if;

  update public.staff_members
     set schedulable_treatment = p_treatment,
         schedulable_training  = p_training
   where id = p_staff_member_id
     and organization_id = v_org;

end;
$function$;

CREATE OR REPLACE FUNCTION public.set_staff_working_hour_exception(p_staff_member_id uuid, p_date date, p_unavailable boolean, p_blocks jsonb DEFAULT '[]'::jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor    uuid;
  v_org      uuid;
  v_tz       text;
  v_abwesend boolean;
  v_alt      jsonb;
  v_neu      jsonb;
  v_alt_ids  uuid[];
  v_neu_ids  uuid[];
  v_aktion   text;
  v_art      text;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_manage_working_hours() then
    raise exception 'not allowed to manage working hours' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to manage working hours' using errcode = '42501';
  end if;

  select o.time_zone into v_tz
  from public.organizations o
  where o.id = v_org;

  if v_tz is null then
    raise exception 'organization has no time zone' using errcode = '22023';
  end if;

  if p_date is null then
    raise exception 'date is required' using errcode = '22023';
  end if;

  if not app.is_assignable_therapist(p_staff_member_id, v_org) then
    raise exception 'staff member not assignable' using errcode = 'P0002';
  end if;

  if p_blocks is null or jsonb_typeof(p_blocks) <> 'array' then
    raise exception 'blocks must be an array' using errcode = '22023';
  end if;

  v_abwesend := coalesce(p_unavailable, false);

  if v_abwesend and jsonb_array_length(p_blocks) > 0 then
    raise exception 'an unavailable day cannot have blocks' using errcode = '22023';
  end if;

  select coalesce(
           jsonb_agg(
             jsonb_build_array(a.kind, a.starts_at::text, a.ends_at::text)
             order by a.kind, a.starts_at nulls first
           ),
           '[]'::jsonb
         ),
         coalesce(array_agg(a.id order by a.kind, a.starts_at nulls first), '{}'::uuid[])
    into v_alt, v_alt_ids
  from public.staff_working_hour_exceptions a
  where a.staff_member_id = p_staff_member_id
    and a.organization_id = v_org
    and a.on_date = p_date;

  if v_abwesend then
    v_neu := jsonb_build_array(jsonb_build_array('unavailable', null, null));
  else
    begin
      select coalesce(
               jsonb_agg(jsonb_build_array('block', w.von::text, w.bis::text) order by w.von),
               '[]'::jsonb
             )
        into v_neu
      from (
        select (b ->> 'von')::time as von, (b ->> 'bis')::time as bis
        from jsonb_array_elements(p_blocks) as b
      ) w;
    exception
      when invalid_datetime_format or datetime_field_overflow
           or invalid_text_representation then
        raise exception 'working hour block is invalid' using errcode = '22023';
    end;
  end if;

  if v_alt = v_neu then
    return jsonb_array_length(v_alt);
  end if;

  delete from public.staff_working_hour_exceptions
   where staff_member_id = p_staff_member_id
     and organization_id = v_org
     and on_date = p_date;

  if v_abwesend then
    with eingefuegt as (
      insert into public.staff_working_hour_exceptions (
        organization_id, staff_member_id, on_date, kind, created_by
      )
      values (v_org, p_staff_member_id, p_date, 'unavailable', v_actor)
      returning id
    )
    select coalesce(array_agg(id), '{}'::uuid[]) into v_neu_ids from eingefuegt;
  else
    begin
      with eingefuegt as (
        insert into public.staff_working_hour_exceptions (
          organization_id, staff_member_id, on_date, kind, starts_at, ends_at, created_by
        )
        select v_org, p_staff_member_id, p_date, 'block',
               (b ->> 'von')::time, (b ->> 'bis')::time, v_actor
        from jsonb_array_elements(p_blocks) as b
        returning id
      )
      select coalesce(array_agg(id), '{}'::uuid[]) into v_neu_ids from eingefuegt;
    exception
      when exclusion_violation then
        raise exception 'working hours overlap' using errcode = '23P01';
      when check_violation or not_null_violation
           or invalid_datetime_format or datetime_field_overflow then
        raise exception 'working hour block is invalid' using errcode = '22023';
    end;
  end if;

  v_aktion := app.working_hour_action(
    jsonb_array_length(v_alt), jsonb_array_length(v_neu)
  );

  -- Art der organisatorischen Aktion, nicht ihre Uhrzeiten.
  v_art := case
             when v_aktion = 'removed' then null
             when v_abwesend then 'unavailable'
             else 'block'
           end;


  return jsonb_array_length(v_neu);
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_staff_working_hours(p_staff_member_id uuid, p_weekday smallint, p_blocks jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor    uuid;
  v_org      uuid;
  v_tz       text;
  v_alt      jsonb;
  v_neu      jsonb;
  v_alt_ids  uuid[];
  v_neu_ids  uuid[];
  v_aktion   text;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_manage_working_hours() then
    raise exception 'not allowed to manage working hours' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to manage working hours' using errcode = '42501';
  end if;

  -- Arbeitszeiten sind Ortszeiten. Ohne hinterlegte Praxiszeitzone waeren sie
  -- nicht auswertbar; dieselbe Vorbedingung gilt an allen Schreibpfaden mit
  -- Zeitbezug (CAL-001).
  select o.time_zone into v_tz
  from public.organizations o
  where o.id = v_org;

  if v_tz is null then
    raise exception 'organization has no time zone' using errcode = '22023';
  end if;

  if p_weekday is null or p_weekday not between 1 and 7 then
    raise exception 'weekday must be between 1 and 7' using errcode = '22023';
  end if;

  -- Fremde und unbekannte Personen sind ununterscheidbar.
  if not app.is_assignable_therapist(p_staff_member_id, v_org) then
    raise exception 'staff member not assignable' using errcode = 'P0002';
  end if;

  if p_blocks is null or jsonb_typeof(p_blocks) <> 'array' then
    raise exception 'blocks must be an array' using errcode = '22023';
  end if;

  -- Bestehender Stand, normalisiert und sortiert - Grundlage fuer die
  -- No-op-Erkennung und fuer die Art des Vorgangs.
  select coalesce(
           jsonb_agg(jsonb_build_array(h.starts_at::text, h.ends_at::text) order by h.starts_at),
           '[]'::jsonb
         ),
         coalesce(array_agg(h.id order by h.starts_at), '{}'::uuid[])
    into v_alt, v_alt_ids
  from public.staff_working_hours h
  where h.staff_member_id = p_staff_member_id
    and h.organization_id = v_org
    and h.weekday = p_weekday;

  begin
    select coalesce(
             jsonb_agg(jsonb_build_array(w.von::text, w.bis::text) order by w.von),
             '[]'::jsonb
           )
      into v_neu
    from (
      select (b ->> 'von')::time as von, (b ->> 'bis')::time as bis
      from jsonb_array_elements(p_blocks) as b
    ) w;
  exception
    -- Unbrauchbare Zeitangaben im Array sind ein Eingabefehler, kein interner
    -- Fehler. Bewusst nur diese Faelle - ein `when others` wuerde echte
    -- Stoerungen verschlucken.
    when invalid_datetime_format or datetime_field_overflow
         or invalid_text_representation then
      raise exception 'working hour block is invalid' using errcode = '22023';
  end;

  -- Speichern ohne tatsaechliche Aenderung ist kein Vorgang: weder
  -- Schreibzugriff noch Auditeintrag.
  if v_alt = v_neu then
    return jsonb_array_length(v_alt);
  end if;

  delete from public.staff_working_hours
   where staff_member_id = p_staff_member_id
     and organization_id = v_org
     and weekday = p_weekday;

  begin
    with eingefuegt as (
      insert into public.staff_working_hours (
        organization_id, staff_member_id, weekday, starts_at, ends_at, created_by
      )
      select v_org, p_staff_member_id, p_weekday,
             (b ->> 'von')::time, (b ->> 'bis')::time, v_actor
      from jsonb_array_elements(p_blocks) as b
      returning id
    )
    select coalesce(array_agg(id), '{}'::uuid[]) into v_neu_ids from eingefuegt;
  exception
    when exclusion_violation then
      raise exception 'working hours overlap' using errcode = '23P01';
    when check_violation or not_null_violation
         or invalid_datetime_format or datetime_field_overflow then
      raise exception 'working hour block is invalid' using errcode = '22023';
  end;

  v_aktion := app.working_hour_action(
    jsonb_array_length(v_alt), jsonb_array_length(v_neu)
  );


  return jsonb_array_length(v_neu);
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_take_along_items(p_patient_id uuid, p_items text[])
 RETURNS text[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid;
  v_org   uuid;
  v_neu   text[];
  v_alt   text[];
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_update_patient() then
    raise exception 'not allowed to update patients' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to update patients' using errcode = '42501';
  end if;

  if p_patient_id is null or p_items is null then
    raise exception 'patient and items are required' using errcode = '22023';
  end if;

  perform 1
  from public.patients p
  where p.id = p_patient_id
    and p.organization_id = v_org;

  if not found then
    raise exception 'patient not found' using errcode = 'P0002';
  end if;

  -- Normalisieren: Rand weg, Leeres weg, Doppel (ohne Gross/klein) weg, die
  -- Reihenfolge der Eingabe bleibt.
  select coalesce(array_agg(x.eintrag order by x.nr), '{}'::text[])
    into v_neu
  from (
    select distinct on (lower(btrim(e.eintrag))) btrim(e.eintrag) as eintrag, e.nr
    from unnest(p_items) with ordinality as e(eintrag, nr)
    where e.eintrag is not null and btrim(e.eintrag) <> ''
    order by lower(btrim(e.eintrag)), e.nr
  ) x;

  if not app.take_along_items_valid(v_neu) then
    raise exception 'take-along items must be at most 10 entries of 1 to 60 characters'
      using errcode = '22023';
  end if;

  select cd.take_along_items into v_alt
  from public.patient_care_details cd
  where cd.patient_id = p_patient_id;

  if not found then
    insert into public.patient_care_details (
      patient_id, organization_id, take_along_items, created_by
    )
    values (p_patient_id, v_org, v_neu, v_actor);
  elsif v_alt is distinct from v_neu then
    update public.patient_care_details
       set take_along_items = v_neu
     where patient_id = p_patient_id;
  else
    return v_neu;
  end if;


  return v_neu;
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_task_done(p_task_id uuid, p_done boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor   uuid;
  v_org     uuid;
  v_patient uuid;
  v_status  text;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.can_manage_tasks() then
    raise exception 'not allowed to write tasks' using errcode = '42501';
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to write tasks' using errcode = '42501';
  end if;
  if p_done is null then
    raise exception 'done flag required' using errcode = '22023';
  end if;

  select k.patient_id, k.status into v_patient, v_status
  from public.tasks k
  where k.id = p_task_id and k.organization_id = v_org
  for update;

  if not found then
    raise exception 'task not found' using errcode = 'P0002';
  end if;

  -- Ohne Wechsel kein Eintrag: Ein doppelter Tipp schreibt nichts zweimal.
  if (v_status = 'done') = p_done then
    return;
  end if;

  update public.tasks
     set status     = case when p_done then 'done' else 'open' end,
         done_at    = case when p_done then now() end,
         done_by    = case when p_done then v_actor end,
         updated_at = now(),
         updated_by = v_actor
   where id = p_task_id;

end;
$function$;

CREATE OR REPLACE FUNCTION public.set_treatment_basis_clinical_note(p_treatment_basis_id uuid, p_prescriber_note text, p_expected_updated_at timestamp with time zone)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor   uuid;
  v_org     uuid;
  v_alt     record;
  v_text    text;
  v_stand   timestamptz;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_write_treatment_note() then
    raise exception 'not allowed to write clinical treatment basis notes' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to write clinical treatment basis notes' using errcode = '42501';
  end if;

  if p_expected_updated_at is null then
    raise exception 'expected updated_at is required' using errcode = '22023';
  end if;

  select t.id, t.patient_id, t.treatment_basis_kind, t.prescriber_note, t.updated_at
    into v_alt
  from public.treatment_bases t
  where t.id = p_treatment_basis_id
    and t.organization_id = v_org
  for update;

  if not found then
    raise exception 'treatment basis not found' using errcode = 'P0002';
  end if;

  if v_alt.treatment_basis_kind = 'self_pay' then
    raise exception 'a self-pay basis carries no clinical note' using errcode = '22023';
  end if;

  if v_alt.updated_at is distinct from p_expected_updated_at then
    raise exception 'treatment basis was changed meanwhile' using errcode = '40001';
  end if;

  -- Leer heisst: kein Hinweis. Die Laengengrenze haelt die Constraint
  -- treatment_bases_prescriber_note_check; hier bekommt sie eine Meldung.
  v_text := nullif(btrim(p_prescriber_note), '');
  if v_text is not null and length(v_text) > 2000 then
    raise exception 'clinical note is too long' using errcode = '22023';
  end if;

  update public.treatment_bases
     set prescriber_note = v_text,
         updated_at      = now(),
         updated_by      = v_actor
   where id = p_treatment_basis_id
  returning updated_at into v_stand;


  return v_stand;
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_treatment_basis_icd10(p_treatment_basis_id uuid, p_code text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor      uuid;
  v_org        uuid;
  v_patient_id uuid;
  v_kind       text;
  v_code       text;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_write_treatment_bases() then
    raise exception 'not allowed to write treatment_bases' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to write treatment_bases' using errcode = '42501';
  end if;

  select p.patient_id, p.treatment_basis_kind into v_patient_id, v_kind
  from public.treatment_bases p
  where p.id = p_treatment_basis_id
    and p.organization_id = v_org;

  if not found then
    raise exception 'treatment basis not found' using errcode = 'P0002';
  end if;

  v_code := nullif(upper(btrim(p_code)), '');
  if v_code is not null and v_kind = 'self_pay' then
    raise exception 'self pay treatment bases have no diagnosis' using errcode = '22023';
  end if;
  if v_code is not null
     and v_code !~ '^[A-Z][0-9]{2}(\.[0-9A-Z!*+-]{1,5})?[GVZALR]?$' then
    raise exception 'invalid ICD-10 code' using errcode = '22023';
  end if;

  update public.treatment_bases
     set diagnosis_icd10 = v_code,
         updated_at      = now(),
         updated_by      = v_actor
   where id = p_treatment_basis_id;

end;
$function$;

CREATE OR REPLACE FUNCTION public.set_treatment_table_required(p_patient_id uuid, p_required boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid;
  v_org   uuid;
  v_alt   boolean;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- SECURITY DEFINER umgeht RLS, deshalb wird die Berechtigung hier selbst
  -- geprueft (ADR-004).
  if not app.can_update_patient() then
    raise exception 'not allowed to update patients' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to update patients' using errcode = '42501';
  end if;

  if p_patient_id is null or p_required is null then
    raise exception 'patient and value are required' using errcode = '22023';
  end if;

  -- Nur in der eigenen Organisation suchen: ein fremder Patient ist von einer
  -- unbekannten ID nicht zu unterscheiden.
  perform 1
  from public.patients p
  where p.id = p_patient_id
    and p.organization_id = v_org;

  if not found then
    raise exception 'patient not found' using errcode = 'P0002';
  end if;

  select cd.treatment_table_required into v_alt
  from public.patient_care_details cd
  where cd.patient_id = p_patient_id;

  if not found then
    insert into public.patient_care_details (
      patient_id, organization_id, treatment_table_required, created_by
    )
    values (p_patient_id, v_org, p_required, v_actor);
  elsif v_alt is distinct from p_required then
    update public.patient_care_details
       set treatment_table_required = p_required
     where patient_id = p_patient_id;
  else
    -- Keine tatsaechliche Aenderung: weder Schreibzugriff noch Auditeintrag,
    -- wie bei update_patient.
    return;
  end if;

end;
$function$;

CREATE OR REPLACE FUNCTION public.start_training_for_person(p_person_id uuid, p_contract_started_on date DEFAULT NULL::date, p_date_of_birth date DEFAULT NULL::date, p_email text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_street text DEFAULT NULL::text, p_postal_code text DEFAULT NULL::text, p_city text DEFAULT NULL::text, p_house_number text DEFAULT NULL::text)
 RETURNS uuid
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
  if not app.can_write_training_relationships() then
    perform app.record_denied_write(v_actor, 'training_relationship.created', 'not allowed to manage training clients');
    return null;
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to manage training clients' using errcode = '42501';
  end if;

  -- Die Person sperren und pruefen, dass der Aufrufer sie aus dem anderen
  -- Bereich kennt. app.is_staff() ist die Behandlungsseite; die Trainings-
  -- betreuung allein hat sie nicht.
  perform 1
  from public.persons pe
  where pe.id = p_person_id
    and pe.organization_id = v_org
    and app.is_staff()
    and (
      exists (select 1 from public.patients x where x.person_id = pe.id and x.organization_id = v_org)
      or exists (select 1 from public.staff_members x where x.person_id = pe.id and x.organization_id = v_org)
    )
  for update of pe;
  if not found then
    raise exception 'person not found' using errcode = 'P0002';
  end if;

  if exists (select 1 from public.training_relationships t where t.person_id = p_person_id) then
    raise exception 'training relationship already exists' using errcode = '23505';
  end if;

  insert into public.training_relationships (
    organization_id, person_id, status, contract_started_on, created_by
  )
  values (
    v_org, p_person_id, 'active',
    coalesce(p_contract_started_on, app.training_today(v_org)), v_actor
  )
  returning id into v_id;

  -- Aus der Akte wird nichts uebernommen (ANN-173). Was im Formular steht,
  -- hat die anlegende Person fuer das Training eingegeben - das kommt mit,
  -- sonst gingen ihre Eingaben still verloren (Zweitreview TRN-EPIC-001).
  perform app.write_training_contact(
    v_id, v_org, v_actor, p_date_of_birth, p_email, p_phone, p_street, p_house_number, p_postal_code, p_city
  );


  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.transfer_appointments_to_treatment_basis(p_treatment_basis_id uuid, p_appointment_ids uuid[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org        uuid;
  v_actor      uuid := auth.uid();
  v_patient    uuid;
  v_anzahl     integer;
  v_geschickt  integer;
  v_quellen    uuid[];
  v_fehlend    text;
  v_leistungen integer := 0;
  v_mengen     jsonb   := '[]'::jsonb;
begin
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- Uebertragen aendert einen Termin, nicht die Grundlage: Es ist dasselbe
  -- Recht wie das Umplanen (ADR-004). Wer eine Verordnung schreiben darf, hat
  -- es ohnehin; das Office plant Termine und darf deshalb auch uebertragen.
  if not app.can_update_appointment() then
    raise exception 'not allowed to update appointments' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to update appointments' using errcode = '42501';
  end if;

  if p_treatment_basis_id is null then
    raise exception 'treatment basis is required' using errcode = '22023';
  end if;

  if p_appointment_ids is null or cardinality(p_appointment_ids) = 0 then
    raise exception 'appointments must be a non-empty array' using errcode = '22023';
  end if;

  -- Die Zielgrundlage bestimmt die Patient:in. Sie wird hier gelesen und nicht
  -- vom Aufrufer entgegengenommen: Eine mitgeschickte Patientenkennung waere
  -- eine zweite Wahrheit, die auseinanderlaufen kann.
  select p.patient_id
    into v_patient
  from public.treatment_bases p
  where p.id = p_treatment_basis_id
    and p.organization_id = v_org;

  if not found then
    raise exception 'treatment basis not found' using errcode = 'P0002';
  end if;

  -- Alles oder nichts: Erst wird gezaehlt, was die Bedingungen erfuellt, dann
  -- geschrieben. Eine Kennung, die durchfaellt - fremde Organisation, andere
  -- Patient:in, abgesagt, abgerechnet oder ein Ereignis ohne Patient:in -,
  -- laesst den ganzen Vorgang scheitern.
  v_geschickt := cardinality(array(select distinct unnest(p_appointment_ids)));

  select count(*), array_agg(distinct a.treatment_basis_id)
    into v_anzahl, v_quellen
  from public.appointments a
  where a.id = any(p_appointment_ids)
    and a.organization_id = v_org
    and a.patient_id      = v_patient
    and a.status not in ('cancelled', 'invoiced')
    -- Abgerechnet ist die Leistung, nicht der Termin (ANN-081): Der Zustand
    -- 'invoiced' an appointments entsteht im Betrieb nicht, issue_invoice
    -- setzt ihn nicht. Geprueft wird deshalb der Zustand, den es wirklich
    -- gibt. Die Bedingung oben bleibt daneben stehen - sie kostet nichts und
    -- traegt weiter, falls ADR-018 spaeter vollstaendig umgesetzt wird.
    and not exists (
      select 1 from public.billable_services b
      where b.appointment_id = a.id
        and b.status = 'invoiced'
    );

  if v_anzahl <> v_geschickt then
    raise exception 'appointments are not transferable' using errcode = '22023';
  end if;

  -- ---------------------------------------------------------------------------
  -- ABN-002: Die erfassten Leistungen, die eine Position tragen und noch nicht
  -- am Ziel haengen. Je alter Position die Zielposition mit demselben
  -- Heilmittel; fehlt eine, ist der ganze Vorgang abzuweisen - bevor
  -- irgendetwas geschrieben wurde.
  -- ---------------------------------------------------------------------------
  create temp table abn_umzug on commit drop as
    select b.id              as leistung_id,
           b.quantity        as menge,
           alt.id            as alte_position,
           alt.remedy        as remedy,
           neu.id            as neue_position
    from public.billable_services b
    join public.treatment_base_items alt on alt.id = b.treatment_base_item_id
    left join public.treatment_base_items neu
           on neu.treatment_basis_id = p_treatment_basis_id
          and neu.remedy = alt.remedy
    where b.appointment_id = any(p_appointment_ids)
      and b.organization_id = v_org
      and b.status = 'billable'
      and alt.treatment_basis_id <> p_treatment_basis_id;

  select string_agg(distinct u.remedy, ', ' order by u.remedy)
    into v_fehlend
  from abn_umzug u
  where u.neue_position is null;

  if v_fehlend is not null then
    raise exception 'target basis has no position for remedy %', v_fehlend
      using errcode = '22023';
  end if;

  select count(*) into v_leistungen from abn_umzug;

  if v_leistungen > 0 then
    -- Genau das zuruecknehmen, was das Erfassen gesetzt hat (wie
    -- delete_billable_services) ...
    update public.treatment_base_items p
       set used_quantity = greatest(p.used_quantity - s.menge, 0)
    from (select alte_position, sum(menge)::smallint as menge from abn_umzug group by alte_position) s
    where p.id = s.alte_position;

    -- ... und am Ziel neu verbrauchen. Die Constraint
    -- used_quantity <= prescribed_quantity schuetzt die Abrechnung (ADR-020
    -- Punkt 5); sie bekommt hier nur eine verstaendliche Meldung.
    begin
      update public.treatment_base_items p
         set used_quantity = p.used_quantity + s.menge
      from (select neue_position, sum(menge)::smallint as menge from abn_umzug group by neue_position) s
      where p.id = s.neue_position;
    exception
      when check_violation then
        raise exception 'target basis quantity exhausted' using errcode = '23514';
    end;

    update public.billable_services b
       set treatment_base_item_id = u.neue_position
    from abn_umzug u
    where b.id = u.leistung_id;

    select coalesce(jsonb_agg(jsonb_build_object('remedy', remedy, 'quantity', menge) order by remedy), '[]'::jsonb)
      into v_mengen
    from (select remedy, sum(menge) as menge from abn_umzug group by remedy) m;
  end if;

  -- Der Termin behaelt Tag, Zeit, Person und Ort. `updated_at` bleibt deshalb
  -- unberuehrt: Der Mitteilungsvermerk haengt daran (CAL-012) und gilt weiter -
  -- mitgeteilt wurde ein Zeitpunkt, keine Grundlage.
  update public.appointments a
     set treatment_basis_id = p_treatment_basis_id
   where a.id = any(p_appointment_ids)
     and a.organization_id = v_org;


  return v_anzahl;
end;
$function$;

CREATE OR REPLACE FUNCTION public.update_appointment(p_appointment_id uuid, p_expected_updated_at timestamp with time zone, p_staff_member_id uuid, p_appointment_type text, p_date date, p_start_time time without time zone, p_end_time time without time zone, p_location_id uuid DEFAULT NULL::uuid, p_allow_outside_working_hours boolean DEFAULT false, p_confirmed_past boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor       uuid;
  v_org         uuid;
  v_tz          text;
  v_heute       date;
  v_starts_at   timestamptz;
  v_ends_at     timestamptz;
  v_location_id uuid;
  v_street      text;
  v_house       text;
  v_postal      text;
  v_city        text;
  v_alt         record;
  v_geaendert   text[] := array[]::text[];
  v_zeit        boolean := false;
  v_organisch   boolean := false;
  v_aktion      text;
  v_grid        smallint;
  v_ausserhalb  boolean := false;
  v_alt_laenge  interval;
  v_neu_laenge  interval;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- TRN-004: Die Trainingsbetreuung verschiebt Trainingstermine; welchen
  -- Kontext jemand schreiben darf, entscheidet der Riegel an der Zeile.
  if not (app.can_update_appointment() or app.can_write_training_relationships()) then
    raise exception 'not allowed to update appointments' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to update appointments' using errcode = '42501';
  end if;

  if p_expected_updated_at is null then
    raise exception 'expected updated_at is required' using errcode = '22023';
  end if;

  select a.id, a.patient_id, a.staff_member_id, a.location_id, a.appointment_type,
         a.kind, a.status, a.starts_at, a.ends_at, a.updated_at,
         a.visit_street, a.visit_house_number, a.visit_postal_code, a.visit_city,
         a.training_relationship_id
    into v_alt
  from public.appointments a
  where a.id = p_appointment_id
    and a.organization_id = v_org
    -- TRN-006: kein Durchgriff ueber den gemeinsamen Kalender (ADR-022 Punkt 11).
    and app.may_write_appointment_context(a.kind)
  for update;

  if not found then
    raise exception 'appointment not found' using errcode = 'P0002';
  end if;

  -- Abgesagte Termine sind terminal (ADR-018 Punkt 2).
  if v_alt.status = 'cancelled' then
    raise exception 'cancelled appointment cannot be changed' using errcode = '22023';
  end if;

  -- Durchgefuehrt und nicht angetroffen sind nicht terminal, aber auch nicht
  -- direkt aenderbar: erst wieder oeffnen, dann bearbeiten (CAL-004, CAL-008c).
  if v_alt.status in ('completed', 'no_show') then
    raise exception 'completed appointment must be reopened first' using errcode = '22023';
  end if;

  -- Dokumentiert und abgerechnet haben keinen Rueckweg (ADR-018 Punkt 2).
  if v_alt.status <> 'confirmed' then
    raise exception 'documented appointment cannot be changed' using errcode = '22023';
  end if;

  if v_alt.updated_at is distinct from p_expected_updated_at then
    raise exception 'appointment was changed meanwhile' using errcode = '40001';
  end if;

  if p_appointment_type is null
     or p_appointment_type not in ('home_visit', 'practice', 'video') then
    raise exception 'unknown appointment type' using errcode = '22023';
  end if;

  -- Ein Ereignis hat keine Patientenanschrift, also auch keinen Hausbesuch.
  if v_alt.kind = 'internal' and p_appointment_type = 'home_visit' then
    raise exception 'unknown appointment type' using errcode = '22023';
  end if;

  if p_date is null or p_start_time is null or p_end_time is null then
    raise exception 'date, start time and end time are required' using errcode = '22023';
  end if;

  if p_end_time <= p_start_time then
    raise exception 'end time must be after start time' using errcode = '22023';
  end if;

  select o.time_zone, o.appointment_grid_minutes
    into v_tz, v_grid
  from public.organizations o
  where o.id = v_org;

  if v_tz is null then
    raise exception 'organization has no time zone' using errcode = '22023';
  end if;

  -- PROJECT_PRINCIPLES.md 0.11 Abschnitt 8.1, ANN-056: Die Laenge einer
  -- Behandlung ist frei im Raster, und geprueft wird sie nur, wenn sie sich
  -- aendert. Beide Laengen in Ortszeit, damit ein Bestandstermin an einem
  -- Umstellungstag nicht allein deshalb als geaendert gilt.
  --
  -- Ein Ereignis ist ans Raster gebunden, und zwar an beiden Enden (CAL-015b).
  v_alt_laenge := (v_alt.ends_at   at time zone v_tz)
                - (v_alt.starts_at at time zone v_tz);
  v_neu_laenge := p_end_time - p_start_time;

  -- TRN-004: Ein Trainingstermin ist frei im Raster wie die Behandlung.
  if v_alt.kind in ('therapy', 'training') then
    if v_neu_laenge is distinct from v_alt_laenge
       and not app.is_valid_treatment_length(v_neu_laenge, v_grid) then
      raise exception 'appointment length is not on the appointment grid' using errcode = '22023';
    end if;
  elsif not app.is_on_appointment_grid(p_end_time, v_grid) then
    raise exception 'end time is not on the appointment grid' using errcode = '22023';
  end if;

  v_heute := (now() at time zone v_tz)::date;

  -- FIX-019, ANN-057: Die Vergangenheit ist erlaubt, aber nie unbemerkt.
  -- Ohne Bestaetigung bleibt die Abweisung aus CAL-003 - die Oberflaeche
  -- fragt nach und schickt den Vorgang bestaetigt neu.
  if p_date < v_heute and not coalesce(p_confirmed_past, false) then
    raise exception 'appointment date is in the past' using errcode = '22023';
  end if;

  v_starts_at := (p_date + p_start_time) at time zone v_tz;
  v_ends_at   := (p_date + p_end_time)   at time zone v_tz;

  if v_starts_at is distinct from v_alt.starts_at
     and not app.is_on_appointment_grid(p_start_time, v_grid) then
    raise exception 'start time is not on the appointment grid' using errcode = '22023';
  end if;

  -- Behandeln darf nur, wer zuordenbar ist; an einem Ereignis nimmt auch das
  -- Buero teil (CAL-015b).
  if v_alt.kind = 'therapy' then
    if not app.is_assignable_therapist(p_staff_member_id, v_org) then
      raise exception 'staff member not assignable' using errcode = 'P0002';
    end if;
  elsif v_alt.kind = 'training' then
    -- ANN-176: Einen Trainingstermin betreut, wer die Rolle Trainingsbetreuung hat.
    if not app.is_assignable_trainer(p_staff_member_id, v_org) then
      raise exception 'staff member not assignable' using errcode = 'P0002';
    end if;
  elsif not exists (
    select 1 from public.staff_members sm
    where sm.id = p_staff_member_id
      and sm.organization_id = v_org
      and sm.employment_status = 'active'
  ) then
    raise exception 'staff member not found' using errcode = 'P0002';
  end if;

  if v_starts_at is distinct from v_alt.starts_at
     or v_ends_at is distinct from v_alt.ends_at
     or p_staff_member_id is distinct from v_alt.staff_member_id then
    v_ausserhalb := not app.is_within_working_hours(
      p_staff_member_id, v_org, p_date, p_start_time, p_end_time
    );

    if v_ausserhalb and not coalesce(p_allow_outside_working_hours, false) then
      raise exception 'outside_working_hours' using errcode = '22023';
    end if;
  end if;

  if p_appointment_type = 'practice' then
    if p_location_id is null then
      raise exception 'practice appointment requires a location' using errcode = '22023';
    end if;

    select l.id into v_location_id
    from public.locations l
    where l.id = p_location_id
      and l.organization_id = v_org;

    if not found then
      raise exception 'location not found' using errcode = 'P0002';
    end if;
  else
    v_location_id := null;
  end if;

  if p_appointment_type = 'home_visit' then
    if v_alt.appointment_type = 'home_visit' then
      v_street := v_alt.visit_street;
      v_house  := v_alt.visit_house_number;
      v_postal := v_alt.visit_postal_code;
      v_city   := v_alt.visit_city;
    elsif v_alt.kind = 'training' then
      -- ANN-177: Die Anschrift kommt aus dem Trainingskontakt, nie aus der Akte.
      select x.street, x.house_number, x.postal_code, x.city
        into v_street, v_house, v_postal, v_city
      from app.training_visit_address(v_alt.training_relationship_id) x;

      if v_street is null or v_house is null or v_postal is null or v_city is null then
        raise exception 'home visit requires a complete address' using errcode = '22023';
      end if;
    else
      select
        nullif(btrim(c.street), ''),
        nullif(btrim(c.house_number), ''),
        nullif(btrim(c.postal_code), ''),
        nullif(btrim(c.city), '')
        into v_street, v_house, v_postal, v_city
      from public.patient_contact_details c
      where c.patient_id = v_alt.patient_id;

      if v_street is null or v_house is null or v_postal is null or v_city is null then
        raise exception 'home visit requires a complete patient address' using errcode = '22023';
      end if;
    end if;
  end if;

  if v_alt.staff_member_id is distinct from p_staff_member_id then
    v_geaendert := array_append(v_geaendert, 'staff_member_id');
    v_organisch := true;
  end if;
  if v_alt.appointment_type is distinct from p_appointment_type then
    v_geaendert := array_append(v_geaendert, 'appointment_type');
    v_organisch := true;
  end if;
  if v_alt.location_id is distinct from v_location_id then
    v_geaendert := array_append(v_geaendert, 'location_id');
    v_organisch := true;
  end if;
  if v_alt.starts_at is distinct from v_starts_at then
    v_geaendert := array_append(v_geaendert, 'starts_at');
    v_zeit := true;
  end if;
  if v_alt.ends_at is distinct from v_ends_at then
    v_geaendert := array_append(v_geaendert, 'ends_at');
    v_zeit := true;
  end if;

  if array_length(v_geaendert, 1) is null then
    return p_appointment_id;
  end if;

  begin
    update public.appointments
       set staff_member_id    = p_staff_member_id,
           appointment_type   = p_appointment_type,
           location_id        = v_location_id,
           starts_at          = v_starts_at,
           ends_at            = v_ends_at,
           visit_street       = v_street,
           visit_house_number = v_house,
           visit_postal_code  = v_postal,
           visit_city         = v_city,
           updated_at         = now()
     where id = p_appointment_id
       and updated_at = p_expected_updated_at;

    if not found then
      raise exception 'appointment was changed meanwhile' using errcode = '40001';
    end if;
  exception
    when exclusion_violation then
      raise exception 'appointment overlaps an existing one' using errcode = '23P01';
  end;

  v_aktion := case
    when v_zeit and not v_organisch then 'appointment.rescheduled'
    else 'appointment.updated'
  end;


  return p_appointment_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.update_appointment_event(p_event_group_id uuid, p_expected_updated_at timestamp with time zone, p_title text, p_appointment_type text, p_date date, p_start_time time without time zone, p_end_time time without time zone, p_location_id uuid DEFAULT NULL::uuid, p_allow_outside_working_hours boolean DEFAULT false)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor       uuid;
  v_org         uuid;
  v_tz          text;
  v_grid        smallint;
  v_heute       date;
  v_starts_at   timestamptz;
  v_ends_at     timestamptz;
  v_titel       text;
  v_location_id uuid;
  v_stand       timestamptz;
  v_zeile       record;
  v_ausserhalb  boolean;
  v_konflikt    text;
  v_anzahl      integer := 0;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_update_appointment() then
    raise exception 'not allowed to update appointments' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to update appointments' using errcode = '42501';
  end if;

  if p_event_group_id is null or p_expected_updated_at is null then
    raise exception 'event and expected updated_at are required' using errcode = '22023';
  end if;

  v_titel := btrim(coalesce(p_title, ''));
  if v_titel = '' then
    raise exception 'event title is required' using errcode = '22023';
  end if;
  if length(v_titel) > 120 then
    raise exception 'event title is too long' using errcode = '22023';
  end if;

  if p_appointment_type is null or p_appointment_type not in ('practice', 'video') then
    raise exception 'unknown appointment type' using errcode = '22023';
  end if;

  if p_date is null or p_start_time is null or p_end_time is null then
    raise exception 'date, start time and end time are required' using errcode = '22023';
  end if;

  if p_end_time <= p_start_time then
    raise exception 'end time must be after start time' using errcode = '22023';
  end if;

  select o.time_zone, o.appointment_grid_minutes
    into v_tz, v_grid
  from public.organizations o
  where o.id = v_org;

  if v_tz is null then
    raise exception 'organization has no time zone' using errcode = '22023';
  end if;

  if not app.is_on_appointment_grid(p_start_time, v_grid) then
    raise exception 'start time is not on the appointment grid' using errcode = '22023';
  end if;
  if not app.is_on_appointment_grid(p_end_time, v_grid) then
    raise exception 'end time is not on the appointment grid' using errcode = '22023';
  end if;

  v_heute := (now() at time zone v_tz)::date;
  if p_date < v_heute then
    raise exception 'appointment date is in the past' using errcode = '22023';
  end if;

  v_starts_at := (p_date + p_start_time) at time zone v_tz;
  v_ends_at   := (p_date + p_end_time)   at time zone v_tz;

  if p_appointment_type = 'practice' then
    if p_location_id is null then
      raise exception 'practice appointment requires a location' using errcode = '22023';
    end if;

    select l.id into v_location_id
    from public.locations l
    where l.id = p_location_id
      and l.organization_id = v_org;

    if not found then
      raise exception 'location not found' using errcode = 'P0002';
    end if;
  else
    v_location_id := null;
  end if;

  -- Alle Zeilen der Gruppe sperren, bevor irgendetwas geprueft wird: Sonst
  -- entschiede ein paralleler Vorgang zwischen Pruefung und Schreiben.
  perform 1
  from public.appointments a
  where a.organization_id = v_org
    and a.event_group_id  = p_event_group_id
    and a.kind = 'internal'
  for update;

  select max(a.updated_at) into v_stand
  from public.appointments a
  where a.organization_id = v_org
    and a.event_group_id  = p_event_group_id
    and a.kind = 'internal';

  if v_stand is null then
    raise exception 'event not found' using errcode = 'P0002';
  end if;

  if v_stand is distinct from p_expected_updated_at then
    raise exception 'appointment was changed meanwhile' using errcode = '40001';
  end if;

  -- Eine abgesagte Zeile ist terminal; ein Ereignis mit einer solchen ist als
  -- Ganzes nicht mehr aenderbar (ADR-018 Punkt 2). Fuer einen neuen Zeitraum
  -- wird ein neues Ereignis eingetragen.
  if exists (
    select 1 from public.appointments a
    where a.organization_id = v_org
      and a.event_group_id  = p_event_group_id
      and a.status <> 'confirmed'
  ) then
    raise exception 'cancelled appointment cannot be changed' using errcode = '22023';
  end if;

  for v_zeile in
    select a.id, a.staff_member_id, a.starts_at, a.ends_at
    from public.appointments a
    where a.organization_id = v_org
      and a.event_group_id  = p_event_group_id
    order by a.staff_member_id
  loop
    -- Arbeitszeit je Beteiligter, und nur wenn sich der Zeitraum wirklich
    -- aendert - sonst fragte ein blosses Umbenennen nach einer Bestaetigung,
    -- die mit der Aenderung nichts zu tun hat.
    if v_starts_at is distinct from v_zeile.starts_at
       or v_ends_at is distinct from v_zeile.ends_at then
      v_ausserhalb := not app.is_within_working_hours(
        v_zeile.staff_member_id, v_org, p_date, p_start_time, p_end_time
      );
      if v_ausserhalb and not coalesce(p_allow_outside_working_hours, false) then
        raise exception 'outside_working_hours' using errcode = '22023';
      end if;
    end if;

    -- Konflikt VOR dem Schreiben, und mit Namen: Die Constraint greift sonst
    -- bei irgendeiner Zeile, und die Meldung sagt nicht, wen es trifft.
    select coalesce(pp.given_name || ' ' || pp.family_name, 'Eine beteiligte Person')
      into v_konflikt
    from public.appointments b
    join public.staff_members sm on sm.id = b.staff_member_id
    join public.persons pp       on pp.id = sm.person_id
    where b.organization_id = v_org
      and b.staff_member_id = v_zeile.staff_member_id
      and b.status <> 'cancelled'
      and b.event_group_id is distinct from p_event_group_id
      and tstzrange(b.starts_at, b.ends_at, '[)')
          && tstzrange(v_starts_at, v_ends_at, '[)')
    limit 1;

    if v_konflikt is not null then
      raise exception 'appointment overlaps an existing one for %', v_konflikt
        using errcode = '23P01';
    end if;
  end loop;

  -- Der Riegel aus Abschnitt 7 laesst eine Zeitaenderung an einer Ereigniszeile
  -- nur zu, wenn sie aus genau diesem Vorgang kommt. Transaktionslokal, und
  -- unten ausdruecklich wieder zurueckgenommen.
  perform set_config('app.event_group_update', 'on', true);

  for v_zeile in
    select a.id, a.staff_member_id, a.starts_at, a.ends_at,
           a.appointment_type, a.location_id, a.title
    from public.appointments a
    where a.organization_id = v_org
      and a.event_group_id  = p_event_group_id
    order by a.staff_member_id
  loop
    update public.appointments
       set title            = v_titel,
           appointment_type = p_appointment_type,
           location_id      = v_location_id,
           starts_at        = v_starts_at,
           ends_at          = v_ends_at,
           updated_at       = now()
     where id = v_zeile.id;


    v_anzahl := v_anzahl + 1;
  end loop;

  perform set_config('app.event_group_update', 'off', true);

  return v_anzahl;
end;
$function$;

CREATE OR REPLACE FUNCTION public.update_home_visit_addresses(p_appointment_ids uuid[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org       uuid;
  v_actor     uuid := auth.uid();
  v_geschickt integer;
  v_anzahl    integer;
  v_zeile     record;
begin
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_update_appointment() or not app.may_write_appointment_context('therapy') then
    raise exception 'not allowed to update appointments' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to update appointments' using errcode = '42501';
  end if;

  if p_appointment_ids is null or cardinality(p_appointment_ids) = 0 then
    raise exception 'appointments must be a non-empty array' using errcode = '22023';
  end if;

  v_geschickt := cardinality(array(select distinct unnest(p_appointment_ids)));

  create temp table abn_adressen on commit drop as
    select a.id,
           a.patient_id,
           nullif(btrim(c.street), '')       as street,
           nullif(btrim(c.house_number), '') as house_number,
           nullif(btrim(c.postal_code), '')  as postal_code,
           nullif(btrim(c.city), '')         as city
    from public.appointments a
    join public.patient_contact_details c on c.patient_id = a.patient_id
    where a.id = any(p_appointment_ids)
      and a.organization_id  = v_org
      and a.kind             = 'therapy'
      and a.appointment_type = 'home_visit'
      and a.status           = 'confirmed'
      and a.starts_at        > now();

  select count(*) into v_anzahl from abn_adressen;
  if v_anzahl <> v_geschickt then
    raise exception 'appointments are not updatable' using errcode = '22023';
  end if;

  if exists (
    select 1 from abn_adressen
    where street is null or house_number is null or postal_code is null or city is null
  ) then
    raise exception 'home visit requires a complete patient address' using errcode = '22023';
  end if;

  for v_zeile in select * from abn_adressen loop
    update public.appointments a
       set visit_street       = v_zeile.street,
           visit_house_number = v_zeile.house_number,
           visit_postal_code  = v_zeile.postal_code,
           visit_city         = v_zeile.city,
           updated_at         = now()
     where a.id = v_zeile.id;

  end loop;

  return v_anzahl;
end;
$function$;

CREATE OR REPLACE FUNCTION public.update_patient(p_patient_id uuid, p_given_name text, p_family_name text, p_date_of_birth date, p_email text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_street text DEFAULT NULL::text, p_house_number text DEFAULT NULL::text, p_postal_code text DEFAULT NULL::text, p_city text DEFAULT NULL::text, p_phone_work text DEFAULT NULL::text, p_phone_mobile text DEFAULT NULL::text, p_fax text DEFAULT NULL::text, p_institution text DEFAULT NULL::text, p_primary_therapist_staff_member_id uuid DEFAULT NULL::uuid, p_home_visit_access_note text DEFAULT NULL::text, p_special_note text DEFAULT NULL::text, p_remark text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor          uuid;
  v_org            uuid;
  v_person_id      uuid;
  v_given          text;
  v_family         text;
  v_email          text;
  v_phone          text;
  v_street         text;
  v_house          text;
  v_postal         text;
  v_city           text;
  v_phone_work     text;
  v_phone_mobile   text;
  v_fax            text;
  v_institution    text;
  v_zugang         text;
  v_besonderheit   text;
  v_bemerkung      text;
  v_alt_given      text;
  v_alt_family     text;
  v_alt_dob        date;
  v_alt_email      text;
  v_alt_phone      text;
  v_alt_street     text;
  v_alt_house      text;
  v_alt_postal     text;
  v_alt_city       text;
  v_alt_work       text;
  v_alt_mobile     text;
  v_alt_fax        text;
  v_alt_inst       text;
  v_alt_therapist  uuid;
  v_alt_zugang     text;
  v_alt_besonder   text;
  v_alt_bemerkung  text;
  v_hat_kontakt    boolean;
  v_hat_versorgung boolean;
  v_geaendert      text[] := array[]::text[];
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- SECURITY DEFINER umgeht RLS, deshalb wird die Berechtigung hier selbst
  -- geprueft.
  if not app.can_update_patient() then
    raise exception 'not allowed to update patients' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to update patients' using errcode = '42501';
  end if;

  -- Eingaben serverseitig normalisieren. Die Pruefung im Client ist
  -- Bedienkomfort, keine Zusicherung (ADR-004).
  v_given        := nullif(btrim(p_given_name), '');
  v_family       := nullif(btrim(p_family_name), '');
  v_email        := nullif(btrim(p_email), '');
  v_phone        := nullif(btrim(p_phone), '');
  v_street       := nullif(btrim(p_street), '');
  v_house        := nullif(btrim(p_house_number), '');
  v_postal       := nullif(btrim(p_postal_code), '');
  v_city         := nullif(btrim(p_city), '');
  v_phone_work   := nullif(btrim(p_phone_work), '');
  v_phone_mobile := nullif(btrim(p_phone_mobile), '');
  v_fax          := nullif(btrim(p_fax), '');
  v_institution  := nullif(btrim(p_institution), '');
  v_zugang       := nullif(btrim(p_home_visit_access_note), '');
  v_besonderheit := nullif(btrim(p_special_note), '');
  v_bemerkung    := nullif(btrim(p_remark), '');

  if v_given is null or v_family is null then
    raise exception 'given_name and family_name are required' using errcode = '22023';
  end if;

  if p_date_of_birth is null then
    raise exception 'date_of_birth is required' using errcode = '22023';
  end if;

  if p_date_of_birth > current_date then
    raise exception 'date_of_birth must not be in the future' using errcode = '22023';
  end if;

  -- Zielpatient ausschliesslich in der Organisation des Aufrufers suchen. Ein
  -- Patient einer fremden Praxis wird damit nicht gefunden und ist von einer
  -- unbekannten ID nicht zu unterscheiden.
  select p.person_id, pe.given_name, pe.family_name
    into v_person_id, v_alt_given, v_alt_family
  from public.patients p
  join public.persons pe on pe.id = p.person_id
  where p.id = p_patient_id
    and p.organization_id = v_org;

  if not found then
    raise exception 'patient not found' using errcode = 'P0002';
  end if;

  -- Erst nach der Existenzpruefung: eine fremde Mitarbeiter-ID darf nicht
  -- verraten, ob der Patient existiert - und umgekehrt.
  perform app.assert_staff_member_in_org(p_primary_therapist_staff_member_id, v_org);

  select c.date_of_birth, c.email, c.phone, c.street, c.house_number,
         c.postal_code, c.city, c.phone_work, c.phone_mobile, c.fax, c.institution
    into v_alt_dob, v_alt_email, v_alt_phone, v_alt_street, v_alt_house,
         v_alt_postal, v_alt_city, v_alt_work, v_alt_mobile, v_alt_fax, v_alt_inst
  from public.patient_contact_details c
  where c.patient_id = p_patient_id;
  v_hat_kontakt := found;

  select cd.primary_therapist_staff_member_id, cd.home_visit_access_note,
         cd.special_note, cd.remark
    into v_alt_therapist, v_alt_zugang, v_alt_besonder, v_alt_bemerkung
  from public.patient_care_details cd
  where cd.patient_id = p_patient_id;
  v_hat_versorgung := found;

  -- Nur die NAMEN der tatsaechlich geaenderten Felder werden spaeter
  -- protokolliert - niemals alte oder neue Werte (ADR-010, ADR-011).
  if v_alt_given  is distinct from v_given  then v_geaendert := array_append(v_geaendert, 'given_name');    end if;
  if v_alt_family is distinct from v_family then v_geaendert := array_append(v_geaendert, 'family_name');   end if;
  if v_alt_dob    is distinct from p_date_of_birth then v_geaendert := array_append(v_geaendert, 'date_of_birth'); end if;
  if v_alt_email  is distinct from v_email  then v_geaendert := array_append(v_geaendert, 'email');         end if;
  if v_alt_phone  is distinct from v_phone  then v_geaendert := array_append(v_geaendert, 'phone');         end if;
  if v_alt_street is distinct from v_street then v_geaendert := array_append(v_geaendert, 'street');        end if;
  if v_alt_house  is distinct from v_house  then v_geaendert := array_append(v_geaendert, 'house_number');  end if;
  if v_alt_postal is distinct from v_postal then v_geaendert := array_append(v_geaendert, 'postal_code');   end if;
  if v_alt_city   is distinct from v_city   then v_geaendert := array_append(v_geaendert, 'city');          end if;
  if v_alt_work   is distinct from v_phone_work   then v_geaendert := array_append(v_geaendert, 'phone_work');   end if;
  if v_alt_mobile is distinct from v_phone_mobile then v_geaendert := array_append(v_geaendert, 'phone_mobile'); end if;
  if v_alt_fax    is distinct from v_fax          then v_geaendert := array_append(v_geaendert, 'fax');          end if;
  if v_alt_inst   is distinct from v_institution  then v_geaendert := array_append(v_geaendert, 'institution');  end if;
  if v_alt_therapist is distinct from p_primary_therapist_staff_member_id
    then v_geaendert := array_append(v_geaendert, 'primary_therapist_staff_member_id'); end if;
  if v_alt_zugang    is distinct from v_zugang       then v_geaendert := array_append(v_geaendert, 'home_visit_access_note'); end if;
  if v_alt_besonder  is distinct from v_besonderheit then v_geaendert := array_append(v_geaendert, 'special_note');           end if;
  if v_alt_bemerkung is distinct from v_bemerkung    then v_geaendert := array_append(v_geaendert, 'remark');                 end if;

  -- Ein Absenden ohne tatsaechliche Aenderung ist kein Vorgang: weder
  -- Schreibzugriff noch Auditeintrag.
  if array_length(v_geaendert, 1) is null then
    return p_patient_id;
  end if;

  update public.persons
     set given_name = v_given,
         family_name = v_family
   where id = v_person_id;

  if v_hat_kontakt then
    update public.patient_contact_details
       set date_of_birth = p_date_of_birth,
           email         = v_email,
           phone         = v_phone,
           street        = v_street,
           house_number  = v_house,
           postal_code   = v_postal,
           city          = v_city,
           phone_work    = v_phone_work,
           phone_mobile  = v_phone_mobile,
           fax           = v_fax,
           institution   = v_institution
     where patient_id = p_patient_id;
  else
    -- Bestandsdaten ohne Kontaktsatz: der Satz entsteht mit der ersten
    -- Aenderung, in der Organisation des Patienten.
    insert into public.patient_contact_details (
      patient_id, organization_id, date_of_birth,
      email, phone, street, house_number, postal_code, city,
      phone_work, phone_mobile, fax, institution, created_by
    )
    values (
      p_patient_id, v_org, p_date_of_birth,
      v_email, v_phone, v_street, v_house, v_postal, v_city,
      v_phone_work, v_phone_mobile, v_fax, v_institution, v_actor
    );
  end if;

  if v_hat_versorgung then
    update public.patient_care_details
       set primary_therapist_staff_member_id = p_primary_therapist_staff_member_id,
           home_visit_access_note            = v_zugang,
           special_note                      = v_besonderheit,
           remark                            = v_bemerkung
     where patient_id = p_patient_id;
  else
    insert into public.patient_care_details (
      patient_id, organization_id, primary_therapist_staff_member_id,
      home_visit_access_note, special_note, remark, created_by
    )
    values (
      p_patient_id, v_org, p_primary_therapist_staff_member_id,
      v_zugang, v_besonderheit, v_bemerkung, v_actor
    );
  end if;


  return p_patient_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.update_service_catalog_version(p_version_id uuid, p_label text, p_valid_from date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid;
  v_org   uuid;
  v_label text;
  v_published timestamptz;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_manage_service_catalog() then
    raise exception 'not allowed to manage the service catalog' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();

  select v.published_at into v_published
  from public.service_catalog_versions v
  where v.id = p_version_id and v.organization_id = v_org;

  if not found then
    raise exception 'service catalog version not found' using errcode = '42501';
  end if;

  if v_published is not null then
    raise exception 'published service catalog version is immutable' using errcode = '23514';
  end if;

  v_label := nullif(btrim(p_label), '');
  if v_label is null then
    raise exception 'label is required' using errcode = '22023';
  end if;

  if p_valid_from is null then
    raise exception 'valid_from is required' using errcode = '22023';
  end if;

  update public.service_catalog_versions
     set label = v_label, valid_from = p_valid_from
   where id = p_version_id;


  return p_version_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.update_staff_member(p_staff_member_id uuid, p_given_name text, p_family_name text, p_work_email text DEFAULT NULL::text, p_work_phone text DEFAULT NULL::text, p_primary_location_id uuid DEFAULT NULL::uuid, p_date_of_birth date DEFAULT NULL::date, p_private_email text DEFAULT NULL::text, p_private_phone text DEFAULT NULL::text, p_street text DEFAULT NULL::text, p_postal_code text DEFAULT NULL::text, p_city text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor       uuid;
  v_org         uuid;
  v_person_id   uuid;
  v_location_id uuid;
  v_given       text;
  v_family      text;
  v_work_email  text;
  v_work_phone  text;
  v_priv_email  text;
  v_priv_phone  text;
  v_street      text;
  v_postal      text;
  v_city        text;
  v_privat      boolean;
  v_alt         record;
  v_geaendert   text[] := array[]::text[];
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_manage_staff_master_data() then
    raise exception 'not allowed to manage staff' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to manage staff' using errcode = '42501';
  end if;

  v_given  := btrim(coalesce(p_given_name, ''));
  v_family := btrim(coalesce(p_family_name, ''));

  if v_given = '' or v_family = '' then
    raise exception 'given name and family name are required' using errcode = '22023';
  end if;

  v_work_email := nullif(btrim(coalesce(p_work_email, '')), '');
  v_work_phone := nullif(btrim(coalesce(p_work_phone, '')), '');
  v_priv_email := nullif(btrim(coalesce(p_private_email, '')), '');
  v_priv_phone := nullif(btrim(coalesce(p_private_phone, '')), '');
  v_street     := nullif(btrim(coalesce(p_street, '')), '');
  v_postal     := nullif(btrim(coalesce(p_postal_code, '')), '');
  v_city       := nullif(btrim(coalesce(p_city, '')), '');

  v_privat := app.can_manage_staff_private_details();

  if not v_privat
     and (p_date_of_birth is not null or v_priv_email is not null or v_priv_phone is not null
          or v_street is not null or v_postal is not null or v_city is not null) then
    raise exception 'private_details_not_allowed' using errcode = '42501';
  end if;

  -- Zielsatz ausschliesslich in der eigenen Organisation suchen.
  select sm.id, sm.person_id, sm.primary_location_id, sm.work_email, sm.work_phone
    into v_alt
  from public.staff_members sm
  where sm.id = p_staff_member_id
    and sm.organization_id = v_org
  for update;

  if not found then
    raise exception 'staff member not found' using errcode = 'P0002';
  end if;

  v_person_id := v_alt.person_id;

  if p_primary_location_id is not null then
    select l.id into v_location_id
    from public.locations l
    where l.id = p_primary_location_id
      and l.organization_id = v_org;

    if not found then
      raise exception 'location not found' using errcode = 'P0002';
    end if;
  end if;

  -- Identitaetskern
  if exists (
    select 1 from public.persons pe
    where pe.id = v_person_id
      and (pe.given_name is distinct from v_given or pe.family_name is distinct from v_family)
  ) then
    update public.persons
       set given_name = v_given, family_name = v_family
     where id = v_person_id
       and organization_id = v_org;
    v_geaendert := array_append(v_geaendert, 'name');
  end if;

  -- Dienstliche Angaben
  if v_alt.work_email is distinct from v_work_email then
    v_geaendert := array_append(v_geaendert, 'work_email');
  end if;
  if v_alt.work_phone is distinct from v_work_phone then
    v_geaendert := array_append(v_geaendert, 'work_phone');
  end if;
  if v_alt.primary_location_id is distinct from v_location_id then
    v_geaendert := array_append(v_geaendert, 'primary_location_id');
  end if;

  update public.staff_members
     set work_email          = v_work_email,
         work_phone          = v_work_phone,
         primary_location_id = v_location_id
   where id = p_staff_member_id
     and organization_id = v_org;

  -- Privatdaten. Nur fuer Rollen, die sie auch lesen duerfen; fuer alle
  -- anderen bleibt die Zeile unberuehrt. Beschaeftigtendaten bleiben auf
  -- staff_private_details beschraenkt (PROJECT_PRINCIPLES.md 20).
  if v_privat then
    if exists (
      select 1 from public.staff_private_details spd
      where spd.staff_member_id = p_staff_member_id
    ) then
      if exists (
        select 1 from public.staff_private_details spd
        where spd.staff_member_id = p_staff_member_id
          and (
            spd.date_of_birth is distinct from p_date_of_birth
            or spd.private_email is distinct from v_priv_email
            or spd.private_phone is distinct from v_priv_phone
            or spd.street        is distinct from v_street
            or spd.postal_code   is distinct from v_postal
            or spd.city          is distinct from v_city
          )
      ) then
        v_geaendert := array_append(v_geaendert, 'private_details');
      end if;

      update public.staff_private_details
         set date_of_birth = p_date_of_birth,
             private_email = v_priv_email,
             private_phone = v_priv_phone,
             street        = v_street,
             postal_code   = v_postal,
             city          = v_city
       where staff_member_id = p_staff_member_id
         and organization_id = v_org;
    else
      insert into public.staff_private_details (
        staff_member_id, organization_id, date_of_birth,
        private_email, private_phone, street, postal_code, city, created_by
      )
      values (
        p_staff_member_id, v_org, p_date_of_birth,
        v_priv_email, v_priv_phone, v_street, v_postal, v_city, v_actor
      );

      if p_date_of_birth is not null or v_priv_email is not null or v_priv_phone is not null
         or v_street is not null or v_postal is not null or v_city is not null then
        v_geaendert := array_append(v_geaendert, 'private_details');
      end if;
    end if;
  end if;

  -- Kein Unterschied, kein Ereignis. Der Schreibvorgang oben ist dann
  -- wertgleich; ein Auditeintrag wuerde eine Aenderung behaupten, die es nicht
  -- gab (ADR-010).
  if array_length(v_geaendert, 1) is null then
    return p_staff_member_id;
  end if;


  return p_staff_member_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.update_task(p_task_id uuid, p_title text, p_note text DEFAULT NULL::text, p_due_on date DEFAULT NULL::date, p_assigned_staff_member_id uuid DEFAULT NULL::uuid, p_patient_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid;
  v_org   uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.can_manage_tasks() then
    raise exception 'not allowed to write tasks' using errcode = '42501';
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to write tasks' using errcode = '42501';
  end if;

  perform app.task_check_input(v_org, p_patient_id, p_assigned_staff_member_id);

  update public.tasks
     set title                    = btrim(p_title),
         note                     = nullif(btrim(p_note), ''),
         due_on                   = p_due_on,
         assigned_staff_member_id = p_assigned_staff_member_id,
         patient_id               = p_patient_id,
         updated_at               = now(),
         updated_by               = v_actor
   where id = p_task_id
     and organization_id = v_org;

  if not found then
    raise exception 'task not found' using errcode = 'P0002';
  end if;

end;
$function$;

CREATE OR REPLACE FUNCTION public.update_text_snippet(p_snippet_id uuid, p_title text, p_body text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid;
  v_org   uuid;
  v_alt   record;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_use_text_snippets() then
    raise exception 'not allowed to use text snippets' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to use text snippets' using errcode = '42501';
  end if;

  select s.id, s.staff_member_id
    into v_alt
  from public.treatment_text_snippets s
  where s.id = p_snippet_id
    and s.organization_id = v_org
    and (
      s.staff_member_id is null
      or s.staff_member_id in (
        select sm.id from public.staff_members sm where sm.person_id = app.current_person_id()
      )
    )
  for update;

  -- Ein fremder persoenlicher Baustein und ein nicht existierender sehen
  -- gleich aus: die Meldung taugt nicht als Existenz-Orakel.
  if not found then
    raise exception 'text snippet not found' using errcode = 'P0002';
  end if;

  perform app.assert_text_snippet_input(p_title, p_body, v_alt.staff_member_id);

  update public.treatment_text_snippets
     set title      = btrim(p_title),
         body       = btrim(p_body, E' \t\r\n'),
         updated_at = now(),
         updated_by = v_actor
   where id = p_snippet_id;

exception
  when unique_violation then
    raise exception 'a snippet with this title already exists' using errcode = '23505';
end;
$function$;

CREATE OR REPLACE FUNCTION public.update_therapy_report(p_report_id uuid, p_report_text text, p_recommendation text, p_note_ids uuid[], p_body_chart_response_id uuid, p_expected_updated_at timestamp with time zone)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor  uuid;
  v_org    uuid;
  b        public.therapy_reports%rowtype;
  v_text   text := nullif(btrim(p_report_text), '');
  v_empf   text := nullif(btrim(p_recommendation), '');
  v_ids    uuid[];
  v_stand  timestamptz;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.can_write_treatment_note() then
    raise exception 'not allowed to write therapy reports' using errcode = '42501';
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to write therapy reports' using errcode = '42501';
  end if;

  select * into b from public.therapy_reports r
  where r.id = p_report_id and r.organization_id = v_org
  for update;
  if not found then
    raise exception 'therapy report not found' using errcode = 'P0002';
  end if;
  if b.status <> 'entwurf' then
    raise exception 'therapy report is completed and cannot be changed' using errcode = '55000';
  end if;
  if b.updated_at is distinct from p_expected_updated_at then
    raise exception 'therapy report was changed in the meantime' using errcode = '40001';
  end if;

  -- Reihenfolge der Auswahl ist ohne Bedeutung; doppelte Kreuze zaehlen einmal.
  select coalesce(array_agg(distinct x), '{}') into v_ids
  from unnest(coalesce(p_note_ids, '{}'::uuid[])) as x;

  perform app.therapy_report_pruefen(v_org, b.patient_id, v_ids, p_body_chart_response_id);

  v_stand := clock_timestamp();

  update public.therapy_reports r
     set report_text               = v_text,
         report_text_updated_by    = case when v_text is distinct from b.report_text
                                          then case when v_text is null then null else v_actor end
                                          else r.report_text_updated_by end,
         report_text_updated_at    = case when v_text is distinct from b.report_text
                                          then case when v_text is null then null else v_stand end
                                          else r.report_text_updated_at end,
         recommendation            = v_empf,
         recommendation_updated_by = case when v_empf is distinct from b.recommendation
                                          then case when v_empf is null then null else v_actor end
                                          else r.recommendation_updated_by end,
         recommendation_updated_at = case when v_empf is distinct from b.recommendation
                                          then case when v_empf is null then null else v_stand end
                                          else r.recommendation_updated_at end,
         note_ids                  = v_ids,
         body_chart_response_id    = p_body_chart_response_id,
         updated_at                = v_stand,
         updated_by                = v_actor
   where r.id = p_report_id;


  return v_stand;
end;
$function$;

CREATE OR REPLACE FUNCTION public.update_training_client(p_relationship_id uuid, p_given_name text, p_family_name text, p_date_of_birth date, p_email text, p_phone text, p_street text, p_postal_code text, p_city text, p_contract_started_on date, p_house_number text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor  uuid;
  v_org    uuid;
  v_person uuid;
  v_ende   date;
  v_alt    record;
  v_felder text[] := '{}';
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.can_write_training_relationships() then
    perform app.record_denied_write(v_actor, 'training_relationship.updated', 'not allowed to manage training clients');
    return null;
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to manage training clients' using errcode = '42501';
  end if;

  if app.leer_zu_null(p_given_name) is null or app.leer_zu_null(p_family_name) is null then
    raise exception 'name is required' using errcode = '22023';
  end if;

  select t.person_id, t.contract_ended_on into v_person, v_ende
  from public.training_relationships t
  where t.id = p_relationship_id and t.organization_id = v_org
  for update;
  if not found then
    raise exception 'training relationship not found' using errcode = 'P0002';
  end if;

  if p_contract_started_on is null then
    raise exception 'contract start is required' using errcode = '22023';
  end if;
  if v_ende is not null and p_contract_started_on > v_ende then
    raise exception 'contract start is after the contract end' using errcode = '22023';
  end if;

  -- Welche Felder sich aendern - nur die Namen der Felder gehen ins Protokoll.
  select pe.given_name, pe.family_name, t.contract_started_on,
         d.date_of_birth, d.email, d.phone, d.street, d.house_number, d.postal_code, d.city
    into v_alt
  from public.training_relationships t
  join public.persons pe on pe.id = t.person_id
  left join public.training_contact_details d on d.training_relationship_id = t.id
  where t.id = p_relationship_id;

  if v_alt.given_name is distinct from btrim(p_given_name)
     or v_alt.family_name is distinct from btrim(p_family_name) then
    v_felder := array_append(v_felder, 'name');
  end if;
  if v_alt.contract_started_on is distinct from p_contract_started_on then
    v_felder := array_append(v_felder, 'contract_started_on');
  end if;
  if v_alt.date_of_birth is distinct from p_date_of_birth
     or v_alt.email is distinct from lower(app.leer_zu_null(p_email))
     or v_alt.phone is distinct from app.leer_zu_null(p_phone)
     or v_alt.street is distinct from app.leer_zu_null(p_street)
     or v_alt.house_number is distinct from app.leer_zu_null(p_house_number)
     or v_alt.postal_code is distinct from app.leer_zu_null(p_postal_code)
     or v_alt.city is distinct from app.leer_zu_null(p_city) then
    v_felder := array_append(v_felder, 'contact');
  end if;

  if cardinality(v_felder) = 0 then
    return p_relationship_id;
  end if;

  -- Der Name einer Mitarbeiter:in oder eines Kontos gehoert in die
  -- Mitarbeiterstammdaten: Aendern darf ihn dort nur, wer sie pflegt
  -- (app.can_manage_staff_master_data, ANN-174). Aus dem Training heraus
  -- ginge das an Pruefung und Protokoll vorbei (Zweitreview TRN-EPIC-001).
  -- Die Meldung verraet nichts, was §4.8 schuetzt: Zugehoerigkeit zum Team
  -- ist kein Behandlungsdatum.
  if array_position(v_felder, 'name') is not null
     and not app.can_manage_staff_master_data()
     and (
       exists (select 1 from public.staff_members x where x.person_id = v_person)
       or exists (select 1 from public.user_profiles x where x.person_id = v_person)
     ) then
    raise exception 'name is managed in staff master data' using errcode = '42501';
  end if;

  -- Der Name gehoert der Person, nicht dem Verhaeltnis (ANN-174).
  update public.persons
     set given_name = btrim(p_given_name), family_name = btrim(p_family_name)
   where id = v_person
     and (given_name is distinct from btrim(p_given_name)
          or family_name is distinct from btrim(p_family_name));

  update public.training_relationships
     set contract_started_on = p_contract_started_on
   where id = p_relationship_id
     and contract_started_on is distinct from p_contract_started_on;

  perform app.write_training_contact(
    p_relationship_id, v_org, v_actor, p_date_of_birth, p_email, p_phone, p_street, p_house_number, p_postal_code, p_city
  );


  return p_relationship_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.update_treatment_basis(p_treatment_basis_id uuid, p_prescriber_id uuid, p_treatment_basis_kind text, p_issued_on date, p_appointment_count integer, p_items jsonb, p_frequency_note text DEFAULT NULL::text, p_note text DEFAULT NULL::text, p_diagnosis text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor      uuid;
  v_org        uuid;
  v_patient_id uuid;
  v_selbstzahler boolean;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_write_treatment_bases() then
    raise exception 'not allowed to write treatment_bases' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to write treatment_bases' using errcode = '42501';
  end if;

  select p.patient_id into v_patient_id
  from public.treatment_bases p
  where p.id = p_treatment_basis_id
    and p.organization_id = v_org;

  if not found then
    raise exception 'treatment basis not found' using errcode = 'P0002';
  end if;

  perform app.assert_treatment_basis_input(v_org, p_prescriber_id, p_treatment_basis_kind, p_issued_on);
  perform app.assert_appointment_count(p_appointment_count);

  v_selbstzahler := p_treatment_basis_kind = 'self_pay';

  -- PRX-010 (Zweitreview): Office tippt die Verordnung ab, raeumt aber keine
  -- klinischen Texte der Therapeut:innen ab. Der Wechsel auf Selbstzahler
  -- loescht Therapieziel, Verordnerhinweis und Empfehlung (ADR-020 Punkt 4) -
  -- stehen welche da, bleibt er den therapeutischen Rollen vorbehalten.
  if v_selbstzahler
     and not app.can_clear_treatment_basis_clinical_texts()
     and app.treatment_basis_has_clinical_texts(p_treatment_basis_id, v_org) then
    raise exception 'clinical texts on this treatment basis can only be cleared by treating roles'
      using errcode = '42501';
  end if;

  -- Therapieziel, Verordnerhinweis und Empfehlung stehen seit VER-EPIC-002
  -- nicht mehr im Formular. Sie kommen deshalb in dieser Anweisung nicht vor
  -- und bleiben unveraendert stehen - **ausser** beim Wechsel auf
  -- "Selbstzahler": Dort verlangt ADR-020 Punkt 4 sie leer, und das entscheidet
  -- der Server, nicht der Aufrufer.
  update public.treatment_bases
     set prescriber_id            = p_prescriber_id,
         treatment_basis_kind     = p_treatment_basis_kind,
         issued_on                = p_issued_on,
         appointment_count        = p_appointment_count,
         frequency_note           = nullif(btrim(p_frequency_note), ''),
         note                     = nullif(btrim(p_note), ''),
         diagnosis                = case when v_selbstzahler
                                         then null else nullif(btrim(p_diagnosis), '') end,
         therapy_goal             = case when v_selbstzahler then null else therapy_goal end,
         prescriber_note          = case when v_selbstzahler then null else prescriber_note end,
         follow_up_recommendation = case when v_selbstzahler
                                         then null else follow_up_recommendation end,
         updated_at               = now(),
         updated_by               = v_actor
   where id = p_treatment_basis_id;

  perform app.write_treatment_base_items(p_treatment_basis_id, v_org, v_actor, p_items);


  return p_treatment_basis_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.update_treatment_note(p_note_id uuid, p_expected_updated_at timestamp with time zone, p_content text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor   uuid;
  v_org     uuid;
  v_inhalt  text;
  v_alt     record;
  v_patient uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_write_treatment_note() then
    raise exception 'not allowed to write treatment documentation' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to write treatment documentation' using errcode = '42501';
  end if;

  if p_expected_updated_at is null then
    raise exception 'expected updated_at is required' using errcode = '22023';
  end if;

  v_inhalt := btrim(coalesce(p_content, ''), E' \t\r\n');

  if v_inhalt = '' then
    raise exception 'documentation must not be empty' using errcode = '22023';
  end if;

  if length(v_inhalt) > 20000 then
    raise exception 'documentation is too long' using errcode = '22023';
  end if;

  select t.id, t.appointment_id, t.content, t.updated_at, t.status
    into v_alt
  from public.treatment_notes t
  where t.id = p_note_id
    and t.organization_id = v_org
  for update;

  if not found then
    raise exception 'treatment note not found' using errcode = 'P0002';
  end if;

  if v_alt.status <> 'draft' then
    raise exception 'finalized treatment note requires a revision' using errcode = '22023';
  end if;

  if v_alt.updated_at is distinct from p_expected_updated_at then
    raise exception 'treatment note was changed meanwhile' using errcode = '40001';
  end if;

  if v_alt.content = v_inhalt then
    return p_note_id;
  end if;

  update public.treatment_notes
     set content    = v_inhalt,
         updated_at = now(),
         updated_by = v_actor
   where id = p_note_id
     and updated_at = p_expected_updated_at;

  if not found then
    raise exception 'treatment note was changed meanwhile' using errcode = '40001';
  end if;

  select a.patient_id into v_patient
  from public.appointments a
  where a.id = v_alt.appointment_id;


  return p_note_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.update_waitlist_entry(p_entry_id uuid, p_expected_updated_at timestamp with time zone, p_treatment_basis_id uuid, p_preferred_staff_member_id uuid, p_appointment_type text, p_duration_minutes integer, p_time_windows jsonb, p_earliest_on date, p_needed_by date, p_priority_reason text, p_note text)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor   uuid;
  v_org     uuid;
  v_eintrag public.waitlist_entries;
  v_stand   timestamptz;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.can_create_appointment() then
    raise exception 'not allowed to write waitlist' using errcode = '42501';
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to write waitlist' using errcode = '42501';
  end if;

  select * into v_eintrag
  from public.waitlist_entries w
  where w.id = p_entry_id and w.organization_id = v_org
  for update;
  if not found then
    raise exception 'waitlist entry not found' using errcode = 'P0002';
  end if;
  if v_eintrag.status <> 'open' then
    raise exception 'waitlist entry closed' using errcode = '22023';
  end if;
  if p_expected_updated_at is null or v_eintrag.updated_at <> p_expected_updated_at then
    raise exception 'waitlist entry changed' using errcode = '40001';
  end if;

  perform app.waitlist_check_input(
    v_org, v_eintrag.patient_id, p_treatment_basis_id, p_preferred_staff_member_id,
    p_appointment_type, p_duration_minutes, p_time_windows, p_earliest_on,
    p_needed_by, p_priority_reason, p_note
  );

  begin
    update public.waitlist_entries w
       set treatment_basis_id        = p_treatment_basis_id,
           preferred_staff_member_id = p_preferred_staff_member_id,
           appointment_type          = p_appointment_type,
           duration_minutes          = p_duration_minutes,
           time_windows              = coalesce(p_time_windows, '[]'::jsonb),
           earliest_on               = p_earliest_on,
           needed_by                 = p_needed_by,
           priority_reason           = p_priority_reason,
           note                      = nullif(btrim(p_note), ''),
           updated_at                = clock_timestamp(),
           updated_by                = v_actor
     where w.id = p_entry_id
    returning w.updated_at into v_stand;
  exception
    when unique_violation then
      raise exception 'patient already on waitlist' using errcode = '23505';
  end;


  return v_stand;
end;
$function$;

CREATE OR REPLACE FUNCTION public.void_offset_payments(p_offset_group uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor   uuid;
  v_org     uuid;
  v_zeile   record;
  v_eingang integer;
  v_rueck   integer;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_manage_invoicing() then
    raise exception 'not allowed to manage invoices' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();

  if p_reason is null or length(btrim(p_reason)) < 3 then
    raise exception 'a void needs a reason' using errcode = '22023';
  end if;

  perform 1 from public.invoices i
   where i.id in (select p.invoice_id from public.payments p where p.offset_group = p_offset_group)
     and i.organization_id = v_org
   order by i.id
   for update;

  perform 1 from public.payments p
   where p.offset_group = p_offset_group and p.organization_id = v_org
   order by p.id
   for update;

  if not exists (
    select 1 from public.payments p
    where p.offset_group = p_offset_group and p.organization_id = v_org and p.voided_at is null
  ) then
    raise exception 'payment not found' using errcode = '42501';
  end if;

  -- An der Ersatzrechnung faellt ein Eingang weg. Stehen dort Rueckzahlungen,
  -- die ohne ihn ueber dem Eingang laegen, zuerst diese stornieren - dieselbe
  -- Regel wie bei einem einzelnen Eingang.
  for v_zeile in
    select p.invoice_id from public.payments p
    where p.offset_group = p_offset_group and p.direction = 'incoming'
  loop
    select coalesce(sum(case when p.direction = 'incoming' then p.amount_cents else 0 end), 0),
           coalesce(sum(case when p.direction = 'refund'   then p.amount_cents else 0 end), 0)
      into v_eingang, v_rueck
    from public.payments p
    where p.invoice_id = v_zeile.invoice_id
      and p.voided_at is null
      and p.offset_group is distinct from p_offset_group;

    if v_rueck > v_eingang then
      raise exception 'voiding this payment would leave refunds without payments received'
        using errcode = '23514';
    end if;
  end loop;

  update public.payments
     set voided_at   = now(),
         voided_by   = v_actor,
         void_reason = btrim(p_reason)
   where offset_group = p_offset_group
     and voided_at is null;

end;
$function$;

CREATE OR REPLACE FUNCTION public.void_payment(p_payment_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor   uuid;
  v_org     uuid;
  v_payment record;
  v_eingang integer;
  v_rueck   integer;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_manage_invoicing() then
    raise exception 'not allowed to manage invoices' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();

  -- ABN-008: Eine Verrechnung besteht aus zwei Buchungen, einer an jeder
  -- Rechnung. Sie werden nur gemeinsam storniert; eine Haelfte allein liesse
  -- Geld an einer Rechnung auftauchen oder verschwinden. Uebergeben wird
  -- VOR jeder Sperre: void_offset_payments sperrt erst beide Rechnungen,
  -- dann beide Zeilen - in fester Reihenfolge (Zweitreview B6).
  if exists (
    select 1 from public.payments p
    where p.id = p_payment_id and p.organization_id = v_org and p.offset_group is not null
  ) then
    perform public.void_offset_payments(
      (select p.offset_group from public.payments p where p.id = p_payment_id), p_reason);
    return;
  end if;

  select p.* into v_payment
  from public.payments p
  where p.id = p_payment_id and p.organization_id = v_org
  for update;

  if not found then
    raise exception 'payment not found' using errcode = '42501';
  end if;

  if v_payment.voided_at is not null then
    raise exception 'payment is already voided' using errcode = '23514';
  end if;

  if p_reason is null or length(btrim(p_reason)) < 3 then
    raise exception 'a void needs a reason' using errcode = '22023';
  end if;

  -- Dieselbe Sperre wie in record_payment: Beide Vorgaenge aendern die
  -- Zahlungssumme derselben Rechnung und muessen deshalb hintereinander
  -- laufen, nicht nebeneinander.
  perform 1 from public.invoices i where i.id = v_payment.invoice_id for update;

  -- Wird ein Eingang storniert, koennten bereits gebuchte Rueckzahlungen
  -- ueber der verbliebenen Summe liegen. Dann zuerst die Rueckzahlung
  -- stornieren - sonst stuende am Ende mehr ausgezahlt als eingegangen.
  if v_payment.direction = 'incoming' then
    select coalesce(sum(case when p.direction = 'incoming' then p.amount_cents else 0 end), 0),
           coalesce(sum(case when p.direction = 'refund'   then p.amount_cents else 0 end), 0)
      into v_eingang, v_rueck
    from public.payments p
    where p.invoice_id = v_payment.invoice_id
      and p.voided_at is null
      and p.id <> p_payment_id;

    if v_rueck > v_eingang then
      raise exception 'voiding this payment would leave refunds without payments received'
        using errcode = '23514';
    end if;
  end if;

  update public.payments
     set voided_at   = now(),
         voided_by   = v_actor,
         void_reason = btrim(p_reason)
   where id = p_payment_id;

end;
$function$;

CREATE OR REPLACE FUNCTION public.waive_appointment_fee(p_appointment_id uuid, p_expected_updated_at timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid;
  v_org   uuid;
  v_alt   record;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_record_billable_services() then
    raise exception 'not allowed to waive fees' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to waive fees' using errcode = '42501';
  end if;

  if p_expected_updated_at is null then
    raise exception 'expected updated_at is required' using errcode = '22023';
  end if;

  select a.id, a.patient_id, a.status, a.fee_basis, a.fee_waived_at, a.updated_at
    into v_alt
  from public.appointments a
  where a.id = p_appointment_id
    and a.organization_id = v_org
  for update;

  if not found then
    raise exception 'appointment not found' using errcode = 'P0002';
  end if;

  if v_alt.fee_basis is null then
    raise exception 'appointment has no fee occasion' using errcode = '22023';
  end if;

  if v_alt.fee_waived_at is not null then
    raise exception 'fee is already waived' using errcode = '22023';
  end if;

  if v_alt.status = 'invoiced' then
    raise exception 'fee is already invoiced' using errcode = '22023';
  end if;

  if exists (select 1 from public.billable_services b where b.appointment_id = p_appointment_id) then
    raise exception 'fee is already recorded as a service' using errcode = '22023';
  end if;

  if v_alt.updated_at is distinct from p_expected_updated_at then
    raise exception 'appointment was changed meanwhile' using errcode = '40001';
  end if;

  update public.appointments
     set fee_waived_at = now(),
         fee_waived_by = v_actor,
         updated_at    = now()
   where id = p_appointment_id
     and updated_at = p_expected_updated_at;

  if not found then
    raise exception 'appointment was changed meanwhile' using errcode = '40001';
  end if;


  return p_appointment_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.write_service_catalog_items(p_version_id uuid, p_items jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid;
  v_org   uuid;
  v_published timestamptz;
  v_anzahl integer;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_manage_service_catalog() then
    raise exception 'not allowed to manage the service catalog' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();

  select v.published_at into v_published
  from public.service_catalog_versions v
  where v.id = p_version_id and v.organization_id = v_org;

  if not found then
    raise exception 'service catalog version not found' using errcode = '42501';
  end if;

  if v_published is not null then
    raise exception 'published service catalog version is immutable' using errcode = '23514';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'items must be an array' using errcode = '22023';
  end if;

  delete from public.service_catalog_items where catalog_version_id = p_version_id;

  insert into public.service_catalog_items (
    organization_id, catalog_version_id, sort_order, code, label,
    item_kind, remedy, unit_price_cents, currency, tax_treatment, tax_rate_permille,
    service_area, created_by
  )
  select
    v_org,
    p_version_id,
    (zeile.ordinalitaet)::smallint,
    btrim(zeile.eintrag ->> 'code'),
    btrim(zeile.eintrag ->> 'label'),
    coalesce(zeile.eintrag ->> 'item_kind', 'treatment'),
    nullif(btrim(coalesce(zeile.eintrag ->> 'remedy', '')), ''),
    (zeile.eintrag ->> 'unit_price_cents')::integer,
    'EUR',
    coalesce(zeile.eintrag ->> 'tax_treatment', 'exempt_healthcare'),
    coalesce((zeile.eintrag ->> 'tax_rate_permille')::smallint, 0::smallint),
    coalesce(zeile.eintrag ->> 'service_area', 'therapy'),
    v_actor
  from jsonb_array_elements(p_items) with ordinality as zeile(eintrag, ordinalitaet);

  select count(*) into v_anzahl
  from public.service_catalog_items where catalog_version_id = p_version_id;


  return v_anzahl;
end;
$function$;
