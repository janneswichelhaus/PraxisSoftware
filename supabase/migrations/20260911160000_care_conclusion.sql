-- =============================================================================
-- Abschluss der Versorgung: der Anker der klinischen Aufbewahrung (LOE-001b)
--
-- ADR-008 knuepft die zehnjaehrige Aufbewahrung der Patientenakte an den
-- "Abschluss der Behandlung" und stellt im selben Atemzug fest, dass dieser
-- Zeitpunkt bisher nirgends definiert ist - er wird dort ausdruecklich zur
-- Voraussetzung der gesamten klinischen Retention erklaert. Diese Migration
-- liefert ihn.
--
-- WARUM EIN EIGENES FELD UND NICHT status = 'inactive'. ANN-002 haelt fest,
-- dass 'inactive' eine rein organisatorische Markierung ist ("nicht in
-- laufender Versorgung"), keinen Behandlungsabschluss bedeutet und keine Frist
-- startet; ein Abschluss brauche ein eigenes Feld mit ADR-Bezug. Genau das ist
-- care_concluded_on. Beide bleiben nebeneinander bestehen und bedeuten
-- Verschiedenes: inaktiv ist eine Aussage ueber den Kalender, abgeschlossen
-- eine ueber die Behandlung.
--
-- WARUM VON HAND UND NICHT NACH ZEITABLAUF. Der Abschluss startet eine
-- zehnjaehrige Frist, an deren Ende echte Loeschung steht (ADR-008 Punkt 3).
-- Ein stiller Automatismus - "sechs Monate kein Termin, also abgeschlossen" -
-- wuerde diese Frist ohne fachliche Entscheidung starten; eine Pause in der
-- Versorgung ist kein Abschluss. Die automatische Klassifizierung, die Jannes
-- sich wuenscht (IDEA-LZK-007), haengt ausserdem an B9 und ist damit heute
-- nicht entscheidbar. Registriert als ANN-032.
--
-- WARUM RUECKNEHMBAR. Eine Patientin, die nach drei Jahren wiederkommt, ist
-- keine neue Akte. Die Ruecknahme setzt den Anker zurueck; die Frist beginnt
-- mit dem naechsten Abschluss neu. Ein Irrtum ist damit korrigierbar, solange
-- die Frist laeuft - danach sind die Daten weg, und das ist der Zweck.
--
-- WORTWAHL. In der Oberflaeche heisst der Vorgang "Versorgung abschliessen",
-- nicht "Behandlung abschliessen" - letzteres bezeichnet seit UX-007 den
-- Abschluss eines einzelnen Termins samt Dokumentation. Gleiche Sache,
-- gleiches Wort; verschiedene Sachen, verschiedene Woerter.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- patients: der Anker
--
-- care_concluded_on  fachlicher Tag des Abschlusses. Er darf zurueckdatiert
--                    werden (der letzte Behandlungstag liegt oft vor der
--                    Entscheidung), aber nicht in die Zukunft und nicht vor
--                    den Beginn der Versorgung.
-- care_concluded_at  wann die Praxis den Abschluss festgehalten hat.
-- care_concluded_by  wer. Ohne FK wie ueberall sonst, damit ein spaeter
--                    geloeschtes Konto den Nachweis nicht entfernt (ADR-008).
-- -----------------------------------------------------------------------------
alter table public.patients
  add column care_concluded_on date,
  add column care_concluded_at timestamptz,
  add column care_concluded_by uuid;

alter table public.patients
  add constraint patients_care_conclusion_complete check (
    (care_concluded_on is null and care_concluded_at is null and care_concluded_by is null)
    or (care_concluded_on is not null and care_concluded_at is not null and care_concluded_by is not null)
  );

alter table public.patients
  add constraint patients_care_conclusion_after_start check (
    care_concluded_on is null
    or care_started_on is null
    or care_concluded_on >= care_started_on
  );

comment on column public.patients.care_concluded_on is
  'Tag des Abschlusses der Behandlung im Sinne von Par. 630f Abs. 3 BGB. Anker der zehnjaehrigen Aufbewahrung (ADR-008, LOE-001b). Leer bedeutet: laufende Versorgung, keine Frist. Nicht zu verwechseln mit status = inactive (ANN-002).';
comment on column public.patients.care_concluded_at is
  'Zeitpunkt, zu dem der Abschluss festgehalten wurde. Der fachliche Tag steht in care_concluded_on und darf davor liegen.';
comment on column public.patients.care_concluded_by is
  'auth.users.id der abschliessenden Person. Bewusst ohne FK (ADR-008).';

-- Der Loeschlauf sucht ueber genau diese Spalte; ohne Index waere jeder Lauf
-- ein vollstaendiger Durchlauf der Kartei.
create index patients_care_concluded_on_idx on public.patients (care_concluded_on)
  where care_concluded_on is not null;

-- -----------------------------------------------------------------------------
-- Ereigniskatalog erweitern (ADR-010)
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
    'appointment.created',
    'appointment.updated',
    'appointment.rescheduled',
    'appointment.cancelled',
    'appointment.completed',
    'appointment.reopened',
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
    'text_snippet.created',
    'text_snippet.updated',
    'text_snippet.deleted'
  ));

-- -----------------------------------------------------------------------------
-- Wer darf abschliessen
--
-- owner, therapist und team_lead - also die Rollen, die auch dokumentieren
-- (PROJECT_PRINCIPLES.md 4.1, 4.2, 4.5). NICHT office: ob eine Behandlung
-- abgeschlossen ist, ist eine fachliche Aussage ueber den Versorgungsverlauf
-- und kein Verwaltungsvorgang. Der Rollenschnitt ist damit ausdruecklich ein
-- anderer als beim organisatorischen Status (ANN-002, can_change_patient_status:
-- owner, team_lead, office - ohne therapist).
-- -----------------------------------------------------------------------------
create function app.can_conclude_patient_care()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_any_role('owner', 'therapist', 'team_lead')
$$;

comment on function app.can_conclude_patient_care() is
  'Rollen, die den Abschluss der Versorgung setzen und zuruecknehmen duerfen: owner, therapist, team_lead (LOE-001b, ANN-032).';

grant execute on function app.can_conclude_patient_care() to authenticated;

-- -----------------------------------------------------------------------------
-- conclude_patient_care
--
-- Der Tag ist optional; ohne Angabe gilt heute in der Zeitzone der Praxis.
-- Ein bereits abgeschlossener Fall wird nicht stillschweigend umdatiert - wer
-- das Datum korrigieren will, nimmt den Abschluss zurueck und setzt ihn neu.
-- Das haelt den Auditpfad ehrlich: jede Fristverschiebung ist sichtbar.
-- -----------------------------------------------------------------------------
create function public.conclude_patient_care(
  p_patient_id   uuid,
  p_concluded_on date default null
)
returns date
language plpgsql
security definer
set search_path = ''
as $$
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

  -- Der Tag steht im Kontext, weil er die Frist bestimmt: ohne ihn waere der
  -- Eintrag nicht auswertbar. Kein klinischer Inhalt, kein Grund, keine
  -- Diagnose (ADR-010 Punkt 3).
  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'patient.care_concluded', 'patient', p_patient_id, 'success',
    jsonb_build_object('surface', 'web', 'concluded_on', v_tag)
  );

  return v_tag;
end;
$$;

comment on function public.conclude_patient_care(uuid, date) is
  'Haelt den Abschluss der Versorgung fest und startet damit die zehnjaehrige Aufbewahrung (ADR-008, LOE-001b). Protokolliert patient.care_concluded. Nur owner, therapist, team_lead.';

revoke all on function public.conclude_patient_care(uuid, date) from public, anon;
grant execute on function public.conclude_patient_care(uuid, date) to authenticated;

-- -----------------------------------------------------------------------------
-- reopen_patient_care
--
-- Setzt den Anker zurueck. Die Frist beginnt mit dem naechsten Abschluss neu -
-- sie wird nicht fortgesetzt. Das ist die vorsichtigere Seite: eine
-- wiederaufgenommene Behandlung verlaengert die Aufbewahrung, sie verkuerzt
-- sie nie.
-- -----------------------------------------------------------------------------
create function public.reopen_patient_care(p_patient_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
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

  update public.patients
     set care_concluded_on = null,
         care_concluded_at = null,
         care_concluded_by = null
   where id = p_patient_id;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'patient.care_reopened', 'patient', p_patient_id, 'success',
    jsonb_build_object('surface', 'web', 'previous_concluded_on', v_bisher)
  );
end;
$$;

comment on function public.reopen_patient_care(uuid) is
  'Nimmt den Abschluss der Versorgung zurueck; die Aufbewahrungsfrist beginnt mit dem naechsten Abschluss neu (LOE-001b). Protokolliert patient.care_reopened. Nur owner, therapist, team_lead.';

revoke all on function public.reopen_patient_care(uuid) from public, anon;
grant execute on function public.reopen_patient_care(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- patient_directory: den Anker mitliefern
--
-- Der Rueckgabetyp aendert sich, deshalb abraeumen und neu anlegen. Inhaltlich
-- unveraendert gegenueber PAT-005 bis auf die beiden Spalten; security_invoker
-- bleibt, die RLS der Basistabellen entscheidet weiterhin.
--
-- Der Abschluss ist keine klinische Angabe im Sinne von 4.3: er sagt, DASS die
-- Versorgung beendet ist, nicht warum. Er bleibt deshalb fuer office sichtbar -
-- ohne ihn liesse sich die Kartei nicht fuehren. Auch das Patientenkonto sieht
-- ihn: es ist eine Angabe ueber die eigene Versorgung.
-- -----------------------------------------------------------------------------
drop view public.patient_directory;

create view public.patient_directory
with (security_invoker = true) as
select
  p.id,
  p.organization_id,
  p.status,
  p.care_started_on,
  p.care_concluded_on,
  p.care_concluded_at,
  pe.given_name,
  pe.family_name,
  c.date_of_birth,
  c.email,
  c.phone,
  c.phone_work,
  c.phone_mobile,
  c.fax,
  c.institution,
  c.street,
  c.house_number,
  c.postal_code,
  c.city,
  cd.primary_therapist_staff_member_id,
  case
    when tp.id is null then null
    else tp.given_name || ' ' || tp.family_name
  end as primary_therapist_name,
  cd.home_visit_access_note,
  cd.special_note,
  cd.remark
from public.patients p
join public.persons pe on pe.id = p.person_id
left join public.patient_contact_details c on c.patient_id = p.id
left join public.patient_care_details cd on cd.patient_id = p.id
left join public.staff_members tsm on tsm.id = cd.primary_therapist_staff_member_id
left join public.persons tp on tp.id = tsm.person_id;

comment on view public.patient_directory is
  'Patientenkartei fuer die Anwendung. security_invoker: RLS der Basistabellen gilt unveraendert - die internen Versorgungsangaben bleiben fuer ein Patientenkonto leer (PAT-005, ANN-010). Seit LOE-001b mit dem Abschluss der Versorgung.';

revoke all on public.patient_directory from anon, authenticated;
grant select on public.patient_directory to authenticated;
