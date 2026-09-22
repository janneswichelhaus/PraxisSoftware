-- =============================================================================
-- Bootstrap der Praxis: Organisation, Standort, erste Praxisinhaberin (OPS-007, G11)
--
-- ADR-003: V1 hat genau eine Organisation. Sie "wird beim Einrichten der
-- Umgebung angelegt; es gibt keine Oberflaeche, um weitere zu erzeugen". Bis
-- hierher gab es dafuer nur einen Weg, supabase/seed.sql, und der ist
-- synthetisch und darf in eine Umgebung mit echten Daten nie hinein.
--
-- Alles, was nach dem ersten owner-Konto kommt, erledigt die Anwendung
-- bereits selbst: Mitarbeitende, Einladungen, Katalog, Praxisstammdaten,
-- Raster, Arbeitszeiten. Diese Migration schliesst genau die eine Luecke davor.
-- Das Vorgehen steht in docs/betrieb/bootstrap.md; der Datenbanktest
-- supabase/tests/bootstrap.test.ts fuehrt die SQL-Bloecke des Runbooks aus.
--
-- Datenklasse: keine neue Tabelle. Es entstehen Zeilen in organizations,
-- locations, persons, staff_members, staff_private_details, user_profiles,
-- user_roles - mit den Klassen, die diese Tabellen schon tragen - und ein
-- Auditeintrag organization.bootstrapped (Klasse `auditlog`).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Ereigniskatalog: Einrichtung der Praxis
--
-- ADR-010 Punkt 2 nennt "Aenderungen von Rollen und Berechtigungen" und
-- "privilegierte technische Zugriffe auf Produktionssysteme". Der Bootstrap ist
-- beides: die erste Rollenvergabe ueberhaupt, und sie laeuft ueber den
-- SQL-Editor des Infrastrukturkontos.
--
-- Muss deckungsgleich mit AUDIT_ACTIONS in src/features/audit/actions.ts
-- bleiben; supabase/tests/audit.test.ts prueft beides gegeneinander.
-- -----------------------------------------------------------------------------
alter table public.audit_log drop constraint audit_log_action_check;
alter table public.audit_log add constraint audit_log_action_check
  check (action in (
    'patient_record.viewed',
    'patient_record.exported',
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
    'organization.billing_profile_changed',
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
    'treatment_basis.viewed',
    'treatment_basis.created',
    'treatment_basis.updated',
    'treatment_basis.deleted',
    'treatment_basis.appointments_transferred',
    'patient_file.uploaded',
    'patient_file.link_issued',
    'patient_file.deleted',
    'patient_file.type_corrected',
    'storage_deletion.claimed',
    'storage_deletion.receipted',
    'text_snippet.created',
    'text_snippet.updated',
    'text_snippet.deleted',
    'service_catalog.version_created',
    'service_catalog.version_updated',
    'service_catalog.version_published',
    'service_catalog.version_deleted',
    'billable_service.recorded',
    'billable_service.removed',
    'invoice_recipient.created',
    'invoice_recipient.updated',
    'invoice_recipient.deleted',
    'invoice.draft_created',
    'invoice.draft_deleted',
    'invoice.recipient_changed',
    'invoice.issued',
    'invoice.cancelled',
    'invoice.reminder_created',
    'payment.recorded',
    'payment.voided',
    'organization.bootstrapped'
  ));

-- -----------------------------------------------------------------------------
-- app.bootstrap_practice
--
-- Aufrufbar allein durch die Eigentuemerrolle der Datenbank (im gehosteten
-- Projekt: der SQL-Editor des Infrastrukturkontos, ADR-010 Punkt 10 und 11).
-- Kein Grant an anon, authenticated oder service_role; die Funktion liegt im
-- Schema app, das PostgREST nicht ausliefert.
--
-- SECURITY DEFINER, obwohl der Aufrufer ohnehin Eigentuemer ist: So haengt das
-- Ergebnis nicht davon ab, ob die Rolle des SQL-Editors RLS umgeht. Die
-- Pruefung, die sonst Rolle und Organisation uebernimmt, ist hier eine andere:
-- Es darf noch KEINE Organisation geben, und es darf kein angemeldeter
-- Anwendungsnutzer aufrufen. Damit ist der Aufruf zugleich einmalig.
--
-- Das Konto selbst legt die Funktion nicht an (ANN-025): Es entsteht vorher von
-- Hand im Anmeldedienst; hier wird es ueber die E-Mail gefunden und gebunden.
--
-- Der Auditeintrag hat KEINEN handelnden Anwendungsaccount: Gehandelt hat das
-- Infrastrukturkonto, und das gehoert nach ADR-010 Punkt 11 einer getrennten
-- Domaene an. Er traegt deshalb actor_kind = 'system' ohne actor_user_id
-- (ANN-009). Die Inhaberin als Akteurin einzutragen waere dieselbe falsche
-- Angabe, die ANN-009 ausschliesst (Art. 5 Abs. 1 lit. d DSGVO): Sie hat in
-- diesem Moment noch gar nichts getan. Wem die Rolle owner gegeben wurde, steht
-- als Kennung in `context.owner_user_id`; `context.surface = 'sql'` sagt, woher
-- der Eintrag stammt.
--
-- Der Auditkontext traegt keine Namen und keine E-Mail (ADR-010 Punkt 3,
-- ADR-011) - nur Kennungen.
-- -----------------------------------------------------------------------------
create function app.bootstrap_practice(
  p_owner_email       text,
  p_organization_name text,
  p_time_zone         text,
  p_location_name     text,
  p_given_name        text,
  p_family_name       text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email       text;
  v_org_name    text;
  v_time_zone   text;
  v_loc_name    text;
  v_given       text;
  v_family      text;
  v_user        uuid;
  v_confirmed   timestamptz;
  v_treffer     integer;
  v_org         uuid;
  v_location    uuid;
  v_person      uuid;
  v_staff       uuid;
begin
  -- Zweite Sperre neben dem fehlenden Grant: Ein angemeldeter
  -- Anwendungsnutzer richtet keine Praxis ein.
  if auth.uid() is not null then
    raise exception 'bootstrap not allowed for application users' using errcode = '42501';
  end if;

  -- Eine Sperre gegen den gleichzeitigen zweiten Aufruf; die Pruefung darunter
  -- saehe sonst zweimal eine leere Tabelle. Die Sperre traegt nur unter READ
  -- COMMITTED: Unter REPEATABLE READ oder SERIALIZABLE stammt der Schnappschuss
  -- aus der Zeit vor der Sperre, und ein paralleler zweiter Aufruf saehe die
  -- erste Organisation nicht. Deshalb wird jede andere Stufe abgewiesen, statt
  -- sich auf die Voreinstellung des SQL-Editors zu verlassen.
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'bootstrap requires read committed' using errcode = '25001';
  end if;

  lock table public.organizations in share row exclusive mode;

  if exists (select 1 from public.organizations) then
    raise exception 'already_bootstrapped' using errcode = '55000';
  end if;

  v_email     := lower(btrim(coalesce(p_owner_email, '')));
  v_org_name  := btrim(coalesce(p_organization_name, ''));
  v_time_zone := btrim(coalesce(p_time_zone, ''));
  v_loc_name  := btrim(coalesce(p_location_name, ''));
  v_given     := btrim(coalesce(p_given_name, ''));
  v_family    := btrim(coalesce(p_family_name, ''));

  if v_org_name = '' or v_loc_name = '' then
    raise exception 'organization name and location name are required' using errcode = '22023';
  end if;

  if v_given = '' or v_family = '' then
    raise exception 'given name and family name are required' using errcode = '22023';
  end if;

  -- Die Zeitzone legt fest, wie Kalendertage und Uhrzeiten gelesen werden
  -- (CAL-001). Ein Tippfehler faellt sonst erst beim ersten Termin auf.
  if not exists (select 1 from pg_catalog.pg_timezone_names t where t.name = v_time_zone) then
    raise exception 'unknown time zone' using errcode = '22023';
  end if;

  select count(*), min(u.id::text)::uuid, min(u.email_confirmed_at)
    into v_treffer, v_user, v_confirmed
  from auth.users u
  where lower(u.email) = v_email
    -- Ein geloeschtes, gesperrtes oder anonymes Konto wird nicht Inhaberin.
    -- Ueber to_jsonb, weil diese Spalten dem Anmeldedienst gehoeren und nicht
    -- in jeder Fassung von auth.users stehen.
    and to_jsonb(u) ->> 'deleted_at' is null
    and coalesce((to_jsonb(u) ->> 'banned_until')::timestamptz <= now(), true)
    and coalesce((to_jsonb(u) ->> 'is_anonymous')::boolean, false) = false;

  if v_treffer = 0 then
    raise exception 'account not found' using errcode = 'P0002';
  end if;

  if v_treffer > 1 then
    raise exception 'account ambiguous' using errcode = '22023';
  end if;

  -- Ohne bestaetigte Adresse scheitert die erste Anmeldung; besser hier.
  -- Ein schon gebundenes Konto braucht keine eigene Pruefung: Ein Profil setzt
  -- eine Organisation voraus, und die gibt es an dieser Stelle nicht.
  if v_confirmed is null then
    raise exception 'account not confirmed' using errcode = '22023';
  end if;

  insert into public.organizations (name, time_zone, created_by)
  values (v_org_name, v_time_zone, v_user)
  returning id into v_org;

  insert into public.locations (organization_id, name, created_by)
  values (v_org, v_loc_name, v_user)
  returning id into v_location;

  insert into public.persons (organization_id, given_name, family_name, created_by)
  values (v_org, v_given, v_family, v_user)
  returning id into v_person;

  insert into public.staff_members (
    organization_id, person_id, primary_location_id, employment_status, work_email, created_by
  )
  values (v_org, v_person, v_location, 'active', v_email, v_user)
  returning id into v_staff;

  -- Wie create_staff_member: Die Zeile der Privatangaben entsteht immer, leer.
  insert into public.staff_private_details (staff_member_id, organization_id, created_by)
  values (v_staff, v_org, v_user);

  insert into public.user_profiles (id, organization_id, person_id, display_name, created_by)
  values (v_user, v_org, v_person, v_given || ' ' || v_family, v_user);

  insert into public.user_roles (user_id, organization_id, role_key, created_by)
  values (v_user, v_org, 'owner', v_user);

  insert into public.audit_log (
    organization_id, actor_kind, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, 'system', null, 'organization.bootstrapped', 'organization', v_org, 'success',
    jsonb_build_object(
      'surface', 'sql',
      'purpose', 'bootstrap',
      'owner_user_id', v_user,
      'roles', jsonb_build_array('owner')
    )
  );

  return jsonb_build_object(
    'organization_id', v_org,
    'location_id', v_location,
    'staff_member_id', v_staff,
    'user_id', v_user
  );
end;
$$;

revoke all on function app.bootstrap_practice(text, text, text, text, text, text)
  from public, anon, authenticated, service_role;

comment on function app.bootstrap_practice(text, text, text, text, text, text) is
  'Richtet die eine Organisation ein: Standort, Person, Mitarbeiterdatensatz, Profil und Rolle owner fuer ein vorhandenes, bestaetigtes Konto. Nur Eigentuemerrolle, nur solange keine Organisation existiert (OPS-007, ADR-003, ADR-010). Vorgehen: docs/betrieb/bootstrap.md.';
