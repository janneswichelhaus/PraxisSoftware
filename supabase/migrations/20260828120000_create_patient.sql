-- =============================================================================
-- Patientenanlage (PAT-001)
--
-- Erster schreibender Fachvorgang. Bewusst als SECURITY-DEFINER-RPC statt als
-- direkte INSERT-Rechte:
--
--   * Atomar. Person, Patient und Kontaktdaten entstehen in EINER Transaktion.
--     Drei Einzelinserts aus dem Browser koennten teilweise scheitern und
--     verwaiste Personen hinterlassen (PROJECT_PRINCIPLES.md 13).
--   * Die Organisation wird aus auth.uid() abgeleitet. Die Funktion nimmt
--     weder organization_id noch irgendeine ID entgegen; eine Einschleusung
--     fremder Bezuege ist strukturell ausgeschlossen (ADR-003).
--   * Der Auditeintrag entsteht serverseitig in derselben Transaktion, nicht
--     aus einer Zusicherung des Clients (ADR-010).
--
-- Dadurch behaelt die Rolle authenticated ausschliesslich SELECT; das
-- deny-by-default aus ADR-004 bleibt unangetastet.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Hausnummer als eigenes Feld
-- -----------------------------------------------------------------------------
alter table public.patient_contact_details
  add column house_number text
    check (house_number is null or length(btrim(house_number)) between 1 and 20);

comment on column public.patient_contact_details.house_number is
  'Hausnummer getrennt von der Strasse - erleichtert spaetere Geokodierung fuer die Tourenplanung (ADR-002, PROJECT_PRINCIPLES.md 9).';

-- Sicht neu aufbauen, damit die Hausnummer neben der Strasse steht.
drop view public.patient_directory;

create view public.patient_directory
with (security_invoker = true) as
select
  p.id,
  p.organization_id,
  p.status,
  p.care_started_on,
  pe.given_name,
  pe.family_name,
  c.date_of_birth,
  c.email,
  c.phone,
  c.street,
  c.house_number,
  c.postal_code,
  c.city
from public.patients p
join public.persons pe on pe.id = p.person_id
left join public.patient_contact_details c on c.patient_id = p.id;

comment on view public.patient_directory is
  'Patientenkartei fuer die Anwendung. security_invoker: RLS der Basistabellen gilt unveraendert.';

revoke all on public.patient_directory from anon, authenticated;
grant select on public.patient_directory to authenticated;

-- -----------------------------------------------------------------------------
-- Ereigniskatalog um patient.created erweitern (ADR-010)
-- -----------------------------------------------------------------------------
alter table public.audit_log drop constraint audit_log_action_check;
alter table public.audit_log add constraint audit_log_action_check
  check (action in ('patient_record.viewed', 'audit_log.read', 'patient.created'));

-- -----------------------------------------------------------------------------
-- Wer darf Patienten anlegen
--
-- Dieselben Praxisrollen, die die Kartei lesen duerfen. Bewusst eine eigene
-- Funktion statt einer Wiederverwendung der Lesepruefung: Lesen und Anlegen
-- sind fachlich verschiedene Rechte und duerfen sich spaeter auseinander
-- entwickeln, ohne dass eine Aenderung stillschweigend beides verschiebt.
-- -----------------------------------------------------------------------------
create or replace function app.can_create_patient()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_any_role('owner', 'therapist', 'team_lead', 'office')
$$;

grant execute on function app.can_create_patient() to authenticated;

-- -----------------------------------------------------------------------------
-- create_patient
--
-- Nimmt ausschliesslich fachliche Eingabefelder entgegen. Keine IDs, keine
-- Organisation, kein Status: der Status ist in diesem Vorgang fest 'active'.
-- -----------------------------------------------------------------------------
create or replace function public.create_patient(
  p_given_name    text,
  p_family_name   text,
  p_date_of_birth date,
  p_email         text default null,
  p_phone         text default null,
  p_street        text default null,
  p_house_number  text default null,
  p_postal_code   text default null,
  p_city          text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
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

  insert into public.persons (organization_id, given_name, family_name, created_by)
  values (v_org, v_given, v_family, v_actor)
  returning id into v_person_id;

  insert into public.patients (organization_id, person_id, status, created_by)
  values (v_org, v_person_id, 'active', v_actor)
  returning id into v_patient_id;

  insert into public.patient_contact_details (
    patient_id, organization_id, date_of_birth,
    email, phone, street, house_number, postal_code, city, created_by
  )
  values (
    v_patient_id, v_org, p_date_of_birth,
    nullif(btrim(p_email), ''),
    nullif(btrim(p_phone), ''),
    nullif(btrim(p_street), ''),
    nullif(btrim(p_house_number), ''),
    nullif(btrim(p_postal_code), ''),
    nullif(btrim(p_city), ''),
    v_actor
  );

  -- Auditeintrag ohne Stammdaten: nur Akteur, Organisation, Patientenbezug,
  -- Zeitpunkt und Ergebnis (ADR-010).
  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'patient.created', 'patient', v_patient_id, 'success',
    jsonb_build_object('surface', 'web')
  );

  return v_patient_id;
end;
$$;

comment on function public.create_patient(text, text, date, text, text, text, text, text, text) is
  'Legt Person, Patient und Kontaktdaten atomar an und protokolliert patient.created (PAT-001, ADR-010).';

revoke all on function public.create_patient(text, text, date, text, text, text, text, text, text)
  from public, anon;
grant execute on function public.create_patient(text, text, date, text, text, text, text, text, text)
  to authenticated;
