-- =============================================================================
-- Patientenstammdaten aendern (PAT-002)
--
-- Zweiter schreibender Fachvorgang, bewusst nach demselben Muster wie
-- create_patient (PAT-001): eine SECURITY-DEFINER-RPC statt direkter
-- UPDATE-Rechte.
--
--   * Atomar. persons und patient_contact_details werden in EINER Transaktion
--     geaendert. Zwei Einzelupdates aus dem Browser koennten teilweise
--     scheitern und einen halb geaenderten Datensatz hinterlassen
--     (PROJECT_PRINCIPLES.md 13).
--   * Die Organisation wird aus auth.uid() abgeleitet, nicht vom Client
--     uebergeben. Der Zielpatient wird ausschliesslich innerhalb dieser
--     Organisation gesucht (ADR-003).
--   * Eine fremde und eine unbekannte Patienten-ID erzeugen deshalb dieselbe
--     Meldung: die Funktion taugt nicht als Existenz-Orakel.
--   * Der Auditeintrag entsteht serverseitig in derselben Transaktion (ADR-010).
--
-- Die Rolle authenticated behaelt weiterhin ausschliesslich SELECT.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Ereigniskatalog um patient.updated erweitern (ADR-010)
--
-- Muss deckungsgleich mit AUDIT_ACTIONS in src/features/audit/actions.ts
-- bleiben; ein Datenbanktest prueft beides gegeneinander.
-- -----------------------------------------------------------------------------
alter table public.audit_log drop constraint audit_log_action_check;
alter table public.audit_log add constraint audit_log_action_check
  check (action in ('patient_record.viewed', 'audit_log.read', 'patient.created', 'patient.updated'));

-- -----------------------------------------------------------------------------
-- Wer darf Stammdaten aendern
--
-- Dieselbe Rollenmenge wie beim Anlegen, aber bewusst eine eigene Funktion:
-- Anlegen und Aendern sind fachlich verschiedene Rechte und duerfen sich
-- spaeter auseinander entwickeln, ohne dass eine Aenderung stillschweigend
-- beides verschiebt.
-- -----------------------------------------------------------------------------
create or replace function app.can_update_patient()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_any_role('owner', 'therapist', 'team_lead', 'office')
$$;

grant execute on function app.can_update_patient() to authenticated;

-- -----------------------------------------------------------------------------
-- update_patient
--
-- Nimmt die Patienten-ID und die fachlichen Eingabefelder entgegen. Keine
-- Organisation, kein Status: der Status bleibt in diesem Vorgang unberuehrt.
-- Optionalfelder duerfen geleert werden und werden dann als null gespeichert.
-- -----------------------------------------------------------------------------
create or replace function public.update_patient(
  p_patient_id    uuid,
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
  v_actor       uuid;
  v_org         uuid;
  v_person_id   uuid;
  v_given       text;
  v_family      text;
  v_email       text;
  v_phone       text;
  v_street      text;
  v_house       text;
  v_postal      text;
  v_city        text;
  v_alt_given   text;
  v_alt_family  text;
  v_alt_dob     date;
  v_alt_email   text;
  v_alt_phone   text;
  v_alt_street  text;
  v_alt_house   text;
  v_alt_postal  text;
  v_alt_city    text;
  v_hat_kontakt boolean;
  v_geaendert   text[] := array[]::text[];
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
  v_given  := nullif(btrim(p_given_name), '');
  v_family := nullif(btrim(p_family_name), '');
  v_email  := nullif(btrim(p_email), '');
  v_phone  := nullif(btrim(p_phone), '');
  v_street := nullif(btrim(p_street), '');
  v_house  := nullif(btrim(p_house_number), '');
  v_postal := nullif(btrim(p_postal_code), '');
  v_city   := nullif(btrim(p_city), '');

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

  select c.date_of_birth, c.email, c.phone, c.street, c.house_number, c.postal_code, c.city
    into v_alt_dob, v_alt_email, v_alt_phone, v_alt_street, v_alt_house, v_alt_postal, v_alt_city
  from public.patient_contact_details c
  where c.patient_id = p_patient_id;
  v_hat_kontakt := found;

  -- Nur die NAMEN der tatsaechlich geaenderten Felder werden spaeter
  -- protokolliert - niemals alte oder neue Werte (ADR-010).
  if v_alt_given  is distinct from v_given  then v_geaendert := array_append(v_geaendert, 'given_name');    end if;
  if v_alt_family is distinct from v_family then v_geaendert := array_append(v_geaendert, 'family_name');   end if;
  if v_alt_dob    is distinct from p_date_of_birth then v_geaendert := array_append(v_geaendert, 'date_of_birth'); end if;
  if v_alt_email  is distinct from v_email  then v_geaendert := array_append(v_geaendert, 'email');         end if;
  if v_alt_phone  is distinct from v_phone  then v_geaendert := array_append(v_geaendert, 'phone');         end if;
  if v_alt_street is distinct from v_street then v_geaendert := array_append(v_geaendert, 'street');        end if;
  if v_alt_house  is distinct from v_house  then v_geaendert := array_append(v_geaendert, 'house_number');  end if;
  if v_alt_postal is distinct from v_postal then v_geaendert := array_append(v_geaendert, 'postal_code');   end if;
  if v_alt_city   is distinct from v_city   then v_geaendert := array_append(v_geaendert, 'city');          end if;

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
           city          = v_city
     where patient_id = p_patient_id;
  else
    -- Bestandsdaten ohne Kontaktsatz: der Satz entsteht mit der ersten
    -- Aenderung, in der Organisation des Patienten.
    insert into public.patient_contact_details (
      patient_id, organization_id, date_of_birth,
      email, phone, street, house_number, postal_code, city, created_by
    )
    values (
      p_patient_id, v_org, p_date_of_birth,
      v_email, v_phone, v_street, v_house, v_postal, v_city, v_actor
    );
  end if;

  -- Auditeintrag ohne Stammdaten: Akteur, Organisation, Patientenbezug,
  -- Zeitpunkt, Ergebnis und die Feldnamen als Metadatum (ADR-010).
  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'patient.updated', 'patient', p_patient_id, 'success',
    jsonb_build_object('surface', 'web', 'changed_fields', to_jsonb(v_geaendert))
  );

  return p_patient_id;
end;
$$;

comment on function public.update_patient(uuid, text, text, date, text, text, text, text, text, text) is
  'Aendert Person und Kontaktdaten eines Patienten atomar und protokolliert patient.updated mit den geaenderten Feldnamen (PAT-002, ADR-010).';

revoke all on function public.update_patient(uuid, text, text, date, text, text, text, text, text, text)
  from public, anon;
grant execute on function public.update_patient(uuid, text, text, date, text, text, text, text, text, text)
  to authenticated;
