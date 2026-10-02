-- =============================================================================
-- POR-005: Vertretung als eigener Zugang (ADR-023 Punkte 4, 13, 15; W3, W4, W6)
--
-- Eine Vertretung ist ein Zugang mit eigenem Konto. Er zeigt auf das
-- Verhaeltnis der vertretenen Person, gehoert aber einer anderen Person:
--
--   legal_representative  Sorgeberechtigte, Betreuung mit Aufgabenkreis
--                         Gesundheitssorge, Vorsorgevollmacht. Darf alles,
--                         was die Person darf.
--   companion             Begleitung: Angehoerige oder Vertraute mit
--                         ausdruecklicher Einwilligung der Person
--                         (Art. 9 Abs. 2 lit. a DSGVO, § 203 StGB). Liest,
--                         schreibt Terminwuensche und Nachrichten; keine
--                         Einwilligung, kein Widerruf, kein Export.
--
-- Die Rechte je Art stehen an einer Stelle: `app.platform_access_allows`
-- (POR-006).
--
-- NACHWEIS (Punkt 13, Fassung 2; ANN-205). Angesehen werden der Ausweis der
-- vertretenden Person und bei rechtlicher Vertretung Vollmacht,
-- Betreuerausweis oder Sorgerechtsnachweis. Gespeichert wird davon nichts,
-- weder Scan noch Nummer - nur, welche Art Dokument wer wann gesehen hat.
--
-- NAME DER VERTRETENDEN PERSON (ANN-203). Sie bekommt keine Zeile in
-- `persons`. Ihr Name steht am Zugang als Teil des Nachweises, weil ihr Konto
-- nach 30 Tagen faellt, der Nachweis erst nach drei Jahren (ADR-023
-- Konsequenzen). Der Name der VERTRETENEN Person steht nie am Zugang.
--
-- NUR VOR ORT (ANN-204). Eine Vertretung wird in V1 nur vor Ort eingeladen;
-- ihre Adresse wird nicht gespeichert. Die Begleitung ist so in zwei Minuten
-- eingerichtet (Punkt 13).
--
-- ALTER (Punkt 15, W4; ANN-208). Unter 18 gibt es nur die rechtliche
-- Vertretung durch Sorgeberechtigte, ab 18 kein Sorgerecht mehr. Am 18.
-- Geburtstag endet ein Zugang aus dem Sorgerecht von selbst:
-- `app.platform_access_ended_at` rechnet ihn ein, und damit Lesefrist,
-- Kontofrist und Loeschlauf. Ohne Geburtsdatum gibt es keine Vertretung.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Auditkatalog und Akteurstyp
--
-- `representative`: das Konto einer vertretenden Person, das ueber einen
-- Vertretungszugang handelt (Punkt 14). Gegenstand ist das Verhaeltnis der
-- vertretenen Person, im Kontext steht der Zugang.
-- -----------------------------------------------------------------------------
alter table public.audit_log drop constraint audit_log_action_check;
alter table public.audit_log add constraint audit_log_action_check
  CHECK ((action = ANY (ARRAY['patient_record.viewed'::text, 'patient_record.exported'::text, 'audit_log.read'::text, 'patient.created'::text, 'patient.updated'::text, 'patient.status_changed'::text, 'patient.care_concluded'::text, 'patient.care_reopened'::text, 'legal_hold.placed'::text, 'legal_hold.released'::text, 'retention.applied'::text, 'retention.reapplied'::text, 'appointment.created'::text, 'appointment.updated'::text, 'appointment.rescheduled'::text, 'appointment.cancelled'::text, 'appointment.no_show'::text, 'appointment.completed'::text, 'appointment.documented'::text, 'appointment.reopened'::text, 'appointment.notified'::text, 'organization.appointment_grid_changed'::text, 'organization.documentation_deadline_changed'::text, 'organization.billing_profile_changed'::text, 'staff_working_hours.created'::text, 'staff_working_hours.updated'::text, 'staff_working_hours.removed'::text, 'staff_working_hour_exception.created'::text, 'staff_working_hour_exception.updated'::text, 'staff_working_hour_exception.removed'::text, 'staff_member.created'::text, 'staff_member.updated'::text, 'staff_member.status_changed'::text, 'staff_account.invited'::text, 'staff_account.invitation_revoked'::text, 'staff_account.invitation_accepted'::text, 'staff_account.roles_changed'::text, 'staff_account.locked'::text, 'staff_account.unlocked'::text, 'staff_account.password_reset_requested'::text, 'account.password_changed'::text, 'account.sessions_ended'::text, 'account.mfa_enrolled'::text, 'account.mfa_removed'::text, 'treatment_note.created'::text, 'treatment_note.updated'::text, 'treatment_note.viewed'::text, 'treatment_note.finalized'::text, 'treatment_note.auto_finalized'::text, 'treatment_note.revised'::text, 'treatment_note.addendum_created'::text, 'treatment_note.history_viewed'::text, 'prescription.viewed'::text, 'prescription.created'::text, 'prescription.updated'::text, 'prescription.deleted'::text, 'treatment_basis.viewed'::text, 'treatment_basis.created'::text, 'treatment_basis.updated'::text, 'treatment_basis.deleted'::text, 'treatment_basis.appointments_transferred'::text, 'patient_file.uploaded'::text, 'patient_file.link_issued'::text, 'patient_file.deleted'::text, 'patient_file.type_corrected'::text, 'storage_deletion.claimed'::text, 'storage_deletion.receipted'::text, 'storage_deletion.ordered'::text, 'text_snippet.created'::text, 'text_snippet.updated'::text, 'text_snippet.deleted'::text, 'service_catalog.version_created'::text, 'service_catalog.version_updated'::text, 'service_catalog.version_published'::text, 'service_catalog.version_deleted'::text, 'billable_service.recorded'::text, 'billable_service.removed'::text, 'invoice_recipient.created'::text, 'invoice_recipient.updated'::text, 'invoice_recipient.deleted'::text, 'invoice.draft_created'::text, 'invoice.draft_deleted'::text, 'invoice.recipient_changed'::text, 'invoice.issued'::text, 'invoice.cancelled'::text, 'invoice.reminder_created'::text, 'payment.recorded'::text, 'payment.voided'::text, 'organization.bootstrapped'::text, 'deletion_runs.read'::text, 'patient_privacy.recorded'::text, 'appointments.read'::text, 'patient_directory.read'::text, 'treatment_bases.read'::text, 'treatment_evidence.read'::text, 'patient_files.read'::text, 'text_snippets.read'::text, 'invoicing.read'::text, 'billable_services.read'::text, 'legal_holds.read'::text, 'storage_deletion.read'::text, 'patient.address_geocoded'::text, 'organization.tour_start_changed'::text, 'questionnaire_response.created'::text, 'questionnaire_response.updated'::text, 'questionnaire_response.completed'::text, 'questionnaire_response.discarded'::text, 'questionnaire_response.viewed'::text, 'patient_course_event.created'::text, 'patient_course_event.removed'::text, 'patient_course_event.viewed'::text, 'therapy_report.created'::text, 'therapy_report.updated'::text, 'therapy_report.completed'::text, 'therapy_report.discarded'::text, 'therapy_report.viewed'::text, 'therapy_report.exported'::text, 'patient_file.handed_out'::text, 'waitlist_entry.created'::text, 'waitlist_entry.updated'::text, 'waitlist_entry.closed'::text, 'waitlist.read'::text, 'territory.saved'::text, 'territory.removed'::text, 'appointment_brief.viewed'::text, 'patient_file.assigned'::text, 'task.created'::text, 'task.updated'::text, 'task.completed'::text, 'task.reopened'::text, 'task.deleted'::text, 'tasks.read'::text, 'appointment.call_recorded'::text, 'patient.merged'::text, 'statistics.read'::text, 'organization.practice_target_changed'::text, 'staff_member.compensation_model_changed'::text, 'statistics.staff_revenue_viewed'::text, 'training_relationship.created'::text, 'training_relationship.updated'::text, 'training_relationship.ended'::text, 'training_relationship.reopened'::text, 'training_relationship.viewed'::text, 'training_relationships.read'::text, 'training_basis.created'::text, 'training_basis.concluded'::text, 'training_basis.reopened'::text, 'training_protocol.created'::text, 'training_protocol.updated'::text, 'training_protocol.finalized'::text, 'training_protocol.viewed'::text, 'training_protocol.discarded'::text, 'platform_access.invited'::text, 'platform_access.invitation_sent'::text, 'platform_access.activated'::text, 'platform_access.password_reset'::text, 'platform_access.locked'::text, 'platform_access.unlocked'::text, 'platform_access.revoked'::text, 'platform_accesses.read'::text, 'platform_access.companion_declined'::text, 'platform_representation.read'::text])));

alter table public.audit_log drop constraint audit_log_actor_kind_check;
alter table public.audit_log add constraint audit_log_actor_kind_check
  check (actor_kind in ('user', 'system', 'platform', 'representative'));

alter table public.audit_log drop constraint audit_log_actor_consistent;
alter table public.audit_log add constraint audit_log_actor_consistent
  check ((actor_kind in ('user', 'platform', 'representative')) = (actor_user_id is not null));

comment on column public.audit_log.actor_kind is
  'user: Praxiskonto; platform: Plattformkonto der Person selbst; representative: Plattformkonto, das ueber einen Vertretungszugang handelt (ADR-023 Punkt 14, POR-005); system: Loeschlauf und andere Vorgaenge ohne Person.';

-- -----------------------------------------------------------------------------
-- 2. Der Zugang lernt die Vertretung
-- -----------------------------------------------------------------------------
alter table public.platform_accesses drop constraint platform_accesses_access_kind_check;
alter table public.platform_accesses add constraint platform_accesses_access_kind_check
  check (access_kind in ('self', 'legal_representative', 'companion'));

-- `consent_withdrawn`: Die Person (oder ihre rechtliche Vertretung) hat die
-- Einwilligung zur Begleitung unter "Ich" widerrufen (Punkt 14, POR-007).
alter table public.platform_accesses drop constraint platform_accesses_revoked_reason_check;
alter table public.platform_accesses add constraint platform_accesses_revoked_reason_check
  check (revoked_reason in ('practice', 'relationship_deleted', 'account_deleted', 'consent_withdrawn'));

alter table public.platform_accesses
  -- Rechtliche Vertretung: worauf sie beruht.
  add column legal_basis text
    check (legal_basis in ('custody', 'guardianship', 'power_of_attorney')),
  -- ANN-203: der Name der vertretenden Person, Teil des Nachweises.
  add column representative_name text
    check (representative_name is null
           or (representative_name = btrim(representative_name)
               and char_length(representative_name) between 2 and 120)),
  -- ANN-205: Welche Art Dokument angesehen wurde - nie das Dokument selbst.
  add column proof_documents text[]
    check (proof_documents is null or (
      cardinality(proof_documents) between 1 and 4
      and proof_documents <@ array['identity_document', 'custody_proof',
                                   'guardianship_certificate', 'power_of_attorney']::text[])),
  -- Betreuung: Der Aufgabenkreis umfasst die Gesundheitssorge (ADR-023
  -- Folgefragen, ANN-205).
  add column guardianship_health_scope boolean,
  add column proof_recorded_by uuid,
  add column proof_recorded_at timestamptz,
  -- Begleitung: die ausdrueckliche Einwilligung der Person (ANN-206).
  add column consent_text_version text,
  add column consent_recorded_by uuid,
  add column consent_recorded_at timestamptz,
  -- Teil des Umfangs (Punkt 13, "konkret"): ob fruehere Nachrichten mit den
  -- Antworten der Praxis sichtbar sind.
  add column consent_earlier_messages boolean;

alter table public.platform_accesses add constraint platform_accesses_kind_fields check (
  case access_kind
    when 'self' then
      legal_basis is null and representative_name is null and proof_documents is null
      and guardianship_health_scope is null and proof_recorded_by is null
      and proof_recorded_at is null and consent_text_version is null
      and consent_recorded_by is null and consent_recorded_at is null
      and consent_earlier_messages is null
    when 'legal_representative' then
      legal_basis is not null and representative_name is not null
      and proof_recorded_by is not null and proof_recorded_at is not null
      and proof_documents @> array['identity_document']::text[]
      and proof_documents @> array[case legal_basis
                                     when 'custody' then 'custody_proof'
                                     when 'guardianship' then 'guardianship_certificate'
                                     else 'power_of_attorney' end]::text[]
      and (legal_basis <> 'guardianship') = (guardianship_health_scope is null)
      and coalesce(guardianship_health_scope, true)
      and consent_text_version is null and consent_recorded_by is null
      and consent_recorded_at is null and consent_earlier_messages is null
    when 'companion' then
      legal_basis is null and guardianship_health_scope is null
      and representative_name is not null
      and proof_recorded_by is not null and proof_recorded_at is not null
      and proof_documents = array['identity_document']::text[]
      and consent_text_version is not null and consent_recorded_by is not null
      and consent_recorded_at is not null and consent_earlier_messages is not null
    else false
  end
);

comment on column public.platform_accesses.representative_name is
  'ANN-203: Name der vertretenden Person als Teil des Nachweises (ADR-023 Konsequenzen). Nie der Name der vertretenen Person.';
comment on column public.platform_accesses.proof_documents is
  'ANN-205: welche Art Dokument angesehen wurde (Ausweis, Sorgerechtsnachweis, Betreuerausweis, Vollmacht). Gespeichert wird nie das Dokument, nie eine Nummer.';
comment on column public.platform_accesses.consent_text_version is
  'ANN-206: Fassung des Wortlauts, in die die Person zur Begleitung eingewilligt hat (src/lib/vertretung.ts).';

-- -----------------------------------------------------------------------------
-- 3. Konstanten - je eine Stelle
-- -----------------------------------------------------------------------------

-- ANN-206: die geltende Fassung des Wortlauts der Einwilligung zur
-- Begleitung. Der Text steht in `src/lib/vertretung.ts` unter derselben
-- Kennung; ein Test haelt beide gleich. Eine neue Fassung ist eine neue
-- Kennung, keine Aenderung der alten.
create function app.platform_companion_consent_version()
returns text
language sql
immutable
set search_path = ''
as $$ select 'begleitung-2026-10-02' $$;

revoke all on function app.platform_companion_consent_version() from public, anon, authenticated;

-- ANN-208: minderjaehrig am heutigen Tag in der Zeitzone der Praxis. `null`
-- ohne Geburtsdatum - die Aufrufer behandeln das restriktiv. Die eine Stelle
-- fuer Einladen, neuen Code und das Ende eines Vertretungszugangs
-- (Zweitreview: vorher rechnete die Einladung in UTC, das Ende in der Praxis).
create function app.platform_is_minor(p_date_of_birth date, p_time_zone text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_date_of_birth > (now() at time zone p_time_zone)::date
                           - make_interval(years => app.platform_min_age_years())
$$;

revoke all on function app.platform_is_minor(date, text) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 4. Das Ende eines Zugangs: am 18. Geburtstag endet das Sorgerecht
--    (Punkt 15, ANN-208). Zweitreview: Jede andere Vertretung endet, sobald
--    die Person nach ihrem Geburtsdatum minderjaehrig ist oder keins mehr
--    traegt - auch nach einer nachtraeglichen Korrektur. Sonst unveraendert.
-- -----------------------------------------------------------------------------
create or replace function app.platform_access_ended_at(p_access_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when a.status = 'revoked' then a.revoked_at
    when a.status = 'invited' and not exists (
           select 1 from public.platform_access_invitations i
           where i.platform_access_id = a.id and i.status = 'pending' and i.expires_at > now()
         )
      then (select max(i.expires_at) from public.platform_access_invitations i
            where i.platform_access_id = a.id)
    else
      -- least() uebergeht null: ohne Ende des Verhaeltnisses zaehlt allein
      -- die Volljaehrigkeit, ohne Sorgerecht allein das Ende.
      least(
        case when r.ended_on is not null
          then app.retention_due_at(r.ended_on, app.platform_read_period(), o.time_zone)
        end,
        case when a.access_kind = 'legal_representative' and a.legal_basis = 'custody'
          then coalesce(
            ((r.date_of_birth + make_interval(years => app.platform_min_age_years()))::timestamp
               at time zone o.time_zone),
            -- Ohne Geburtsdatum ist das Sorgerecht nicht pruefbar: beendet.
            a.created_at)
        end,
        case when a.access_kind <> 'self' and a.legal_basis is distinct from 'custody'
              and coalesce(app.platform_is_minor(r.date_of_birth, o.time_zone), true)
          then a.created_at
        end
      )
  end
  from public.platform_accesses a
  join public.organizations o on o.id = a.organization_id
  left join lateral app.platform_relationship(a.relationship_kind, a.relationship_id) r on true
  where a.id = p_access_id
$$;

-- -----------------------------------------------------------------------------
-- 5. Riegel: Ein Vertretungszugang bindet nie das Konto der vertretenen
--    Person, ein eigener Zugang nie das Konto einer ihrer Vertretungen
--    (Punkte 4 und 13). Sonst unveraendert.
-- -----------------------------------------------------------------------------
create or replace function app.platform_accesses_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_person uuid;
begin
  -- Faellt das Verhaeltnis (on delete set null), endet der Zugang, und seine
  -- Einladungen verlieren die Adresse (ADR-023 Punkt 5).
  if tg_op = 'UPDATE'
     and new.patient_id is null and new.training_relationship_id is null
     and (old.patient_id is not null or old.training_relationship_id is not null) then
    if new.status <> 'revoked' then
      new.status := 'revoked';
      new.revoked_at := now();
      new.revoked_by := null;
      new.revoked_reason := 'relationship_deleted';
      new.locked_at := null;
      new.locked_by := null;
    end if;
    update public.platform_access_invitations i
       set email = null,
           status = case when i.status = 'pending' then 'revoked' else i.status end,
           revoked_at = case when i.status = 'pending' then now() else i.revoked_at end
     where i.platform_access_id = new.id;
    if old.status <> 'revoked' then
      perform app.log_platform_access_event(
        new.organization_id, null, 'system', 'platform_access.revoked', new.id,
        jsonb_build_object('surface', 'system', 'reason', 'relationship_deleted')
      );
    end if;
    return new;
  end if;

  -- POR-005: Art und Nachweis eines Zugangs aendern sich nie. Ein anderer
  -- Umfang ist eine neue Einladung.
  if tg_op = 'UPDATE' and (
       new.access_kind is distinct from old.access_kind
       or new.legal_basis is distinct from old.legal_basis
       or new.representative_name is distinct from old.representative_name
       or new.proof_documents is distinct from old.proof_documents
       or new.consent_text_version is distinct from old.consent_text_version
       or new.consent_earlier_messages is distinct from old.consent_earlier_messages
       or new.guardianship_health_scope is distinct from old.guardianship_health_scope
       or new.proof_recorded_by is distinct from old.proof_recorded_by
       or new.proof_recorded_at is distinct from old.proof_recorded_at
       or new.consent_recorded_by is distinct from old.consent_recorded_by
       or new.consent_recorded_at is distinct from old.consent_recorded_at
       or new.relationship_kind is distinct from old.relationship_kind
       or new.organization_id is distinct from old.organization_id
       or new.relationship_id is distinct from old.relationship_id) then
    raise exception 'platform access kind and proof are fixed' using errcode = '23514';
  end if;

  if new.account_user_id is not null
     and (tg_op = 'INSERT' or new.account_user_id is distinct from old.account_user_id) then
    perform pg_advisory_xact_lock(hashtext('platform_account:' || new.account_user_id::text));

    if exists (select 1 from public.user_profiles up where up.id = new.account_user_id) then
      raise exception 'practice account cannot hold platform access' using errcode = '23514';
    end if;

    select r.person_id into v_person
    from app.platform_relationship(new.relationship_kind, new.relationship_id) r;

    perform pg_advisory_xact_lock(hashtext('platform_person:' || v_person::text));

    if new.access_kind = 'self' then
      if exists (
        select 1 from public.user_profiles up
        join public.user_roles ur on ur.user_id = up.id
        where up.person_id = v_person
      ) then
        raise exception 'person has a practice account' using errcode = '23514';
      end if;

      if exists (
        select 1
        from public.platform_accesses a
        cross join lateral app.platform_relationship(a.relationship_kind, a.relationship_id) r
        where a.id <> new.id
          and a.access_kind = 'self'
          and a.status <> 'revoked'
          and a.account_user_id is not null
          and a.account_user_id <> new.account_user_id
          and r.person_id = v_person
      ) then
        raise exception 'person already has another account' using errcode = '23514';
      end if;

      if exists (
        select 1
        from public.platform_accesses a
        cross join lateral app.platform_relationship(a.relationship_kind, a.relationship_id) r
        where a.account_user_id = new.account_user_id
          and a.id <> new.id
          and a.access_kind = 'self'
          and a.status <> 'revoked'
          and r.person_id is distinct from v_person
      ) then
        raise exception 'account belongs to another person' using errcode = '23514';
      end if;

      -- POR-005: Wer diese Person vertritt, ist nicht diese Person.
      if exists (
        select 1
        from public.platform_accesses a
        cross join lateral app.platform_relationship(a.relationship_kind, a.relationship_id) r
        where a.account_user_id = new.account_user_id
          and a.id <> new.id
          and a.access_kind <> 'self'
          and a.status <> 'revoked'
          and r.person_id = v_person
      ) then
        raise exception 'account represents this person' using errcode = '23514';
      end if;
    else
      -- POR-005: Eine Vertretung ist nie das Konto der vertretenen Person
      -- (Punkt 13: "Gehoert das Konto nicht zur Person des Verhaeltnisses").
      if exists (
        select 1
        from public.platform_accesses a
        cross join lateral app.platform_relationship(a.relationship_kind, a.relationship_id) r
        where a.account_user_id = new.account_user_id
          and a.id <> new.id
          and a.access_kind = 'self'
          and a.status <> 'revoked'
          and r.person_id = v_person
      ) then
        raise exception 'account belongs to the represented person' using errcode = '23514';
      end if;
    end if;
  end if;
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- 6. Die Pruefungen vor einer Vertretung - eine Stelle fuer Art, Grundlage,
--    Alter und Nachweis (Punkte 13, 15; ANN-205, ANN-208).
-- -----------------------------------------------------------------------------
create function app.assert_platform_representation(
  p_access_kind     text,
  p_legal_basis     text,
  p_date_of_birth   date,
  p_time_zone       text,
  p_name            text,
  p_proof_documents text[],
  p_health_scope    boolean,
  p_consent_version text,
  p_earlier_messages boolean
)
returns void
language plpgsql
stable
set search_path = ''
as $$
declare
  v_minderjaehrig boolean;
begin
  if p_access_kind is null or p_access_kind not in ('legal_representative', 'companion') then
    raise exception 'unknown representation kind' using errcode = '22023';
  end if;
  if p_name is null or char_length(btrim(p_name)) < 2 or char_length(btrim(p_name)) > 120 then
    raise exception 'representative name required' using errcode = '22023';
  end if;
  -- ANN-208: ohne Geburtsdatum keine Vertretung - die Altersgrenze ist sonst
  -- nicht pruefbar (wie ANN-190).
  if p_date_of_birth is null then
    raise exception 'date of birth required' using errcode = '22023';
  end if;
  v_minderjaehrig := app.platform_is_minor(p_date_of_birth, p_time_zone);

  if p_proof_documents is null or not (p_proof_documents @> array['identity_document']::text[]) then
    raise exception 'identity document must be seen' using errcode = '22023';
  end if;

  if p_access_kind = 'legal_representative' then
    if p_legal_basis is null or p_legal_basis not in ('custody', 'guardianship', 'power_of_attorney') then
      raise exception 'legal basis required' using errcode = '22023';
    end if;
    -- Punkt 15: unter 18 nur Sorgeberechtigte, ab 18 kein Sorgerecht.
    if v_minderjaehrig and p_legal_basis <> 'custody' then
      raise exception 'minor needs custody' using errcode = '22023';
    end if;
    if not v_minderjaehrig and p_legal_basis = 'custody' then
      raise exception 'custody ends at majority' using errcode = '22023';
    end if;
    if not (p_proof_documents @> array[case p_legal_basis
                                         when 'custody' then 'custody_proof'
                                         when 'guardianship' then 'guardianship_certificate'
                                         else 'power_of_attorney' end]::text[]) then
      raise exception 'authority document must be seen' using errcode = '22023';
    end if;
    if p_legal_basis = 'guardianship' and not coalesce(p_health_scope, false) then
      raise exception 'guardianship must cover health care' using errcode = '22023';
    end if;
  else
    -- Punkt 15: Eine Begleitung gibt es fuer Minderjaehrige nicht.
    if v_minderjaehrig then
      raise exception 'minor needs custody' using errcode = '22023';
    end if;
    if p_consent_version is distinct from app.platform_companion_consent_version() then
      raise exception 'consent of the person required' using errcode = '22023';
    end if;
    if p_earlier_messages is null then
      raise exception 'consent scope required' using errcode = '22023';
    end if;
  end if;
end;
$$;

revoke all on function app.assert_platform_representation(text, text, date, text, text, text[], boolean, text, boolean)
  from public, anon, authenticated;

-- Der Code einer Einladung: 24 Zufallsbytes, URL-tauglich kodiert (wie
-- POR-002). Liefert den Code; gespeichert wird nur sein Hash.
create function app.issue_platform_invitation(
  p_org uuid, p_access_id uuid, p_purpose text, p_actor uuid
)
returns table (invitation_id uuid, code text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code    text;
  v_expires timestamptz;
  v_inv     uuid;
begin
  update public.platform_access_invitations i
     set status = 'revoked', revoked_at = now()
   where i.platform_access_id = p_access_id and i.status = 'pending';

  v_code := translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/', '-_');
  v_expires := now() + app.platform_invitation_validity();

  insert into public.platform_access_invitations (
    organization_id, platform_access_id, purpose, channel, code_hash, expires_at, created_by
  )
  values (p_org, p_access_id, p_purpose, 'on_site', app.platform_code_hash(v_code), v_expires, p_actor)
  returning id into v_inv;

  return query select v_inv, v_code, v_expires;
end;
$$;

revoke all on function app.issue_platform_invitation(uuid, uuid, text, uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 7. Einladen (Punkte 6, 8, 13; ANN-204)
--
-- Legt einen Vertretungszugang mit Nachweis an und stellt eine Einladung vor
-- Ort aus. Liefert den Code GENAU EINMAL.
-- -----------------------------------------------------------------------------
create function public.invite_platform_representation(
  p_relationship_kind   text,
  p_relationship_id     uuid,
  p_access_kind         text,
  p_legal_basis         text,
  p_representative_name text,
  p_proof_documents     text[],
  p_health_scope        boolean,
  p_consent_version     text,
  p_earlier_messages    boolean
)
returns table (
  access_id     uuid,
  invitation_id uuid,
  purpose       text,
  code          text,
  expires_at    timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
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
    p_proof_documents, p_health_scope, p_consent_version, p_earlier_messages
  );

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
    access_kind, legal_basis, representative_name, proof_documents, guardianship_health_scope,
    proof_recorded_by, proof_recorded_at,
    consent_text_version, consent_recorded_by, consent_recorded_at, consent_earlier_messages,
    created_by
  )
  values (
    v_org, p_relationship_kind, p_relationship_id,
    case when p_relationship_kind = 'treatment' then p_relationship_id end,
    case when p_relationship_kind = 'training' then p_relationship_id end,
    p_access_kind,
    case when p_access_kind = 'legal_representative' then p_legal_basis end,
    btrim(p_representative_name), v_docs,
    case when p_access_kind = 'legal_representative' and p_legal_basis = 'guardianship' then true end,
    v_actor, now(),
    case when p_access_kind = 'companion' then p_consent_version end,
    case when p_access_kind = 'companion' then v_actor end,
    case when p_access_kind = 'companion' then now() end,
    case when p_access_kind = 'companion' then p_earlier_messages end,
    v_actor
  )
  returning id into v_access;

  select * into v_inv from app.issue_platform_invitation(v_org, v_access, 'activate', v_actor);

  perform app.log_platform_access_event(
    v_org, v_actor, 'user', 'platform_access.invited', v_access,
    jsonb_build_object('surface', 'web', 'channel', 'on_site', 'purpose', 'activate',
                       'relationship_kind', p_relationship_kind, 'access_kind', p_access_kind,
                       'legal_basis', p_legal_basis)
  );

  return query select v_access, v_inv.invitation_id, 'activate'::text, v_inv.code, v_inv.expires_at;
end;
$$;

revoke all on function public.invite_platform_representation(text, uuid, text, text, text, text[], boolean, text, boolean)
  from public, anon;
grant execute on function public.invite_platform_representation(text, uuid, text, text, text, text[], boolean, text, boolean)
  to authenticated;

comment on function public.invite_platform_representation(text, uuid, text, text, text, text[], boolean, text, boolean) is
  'POR-005: laedt eine rechtliche Vertretung oder Begleitung vor Ort ein (ADR-023 Punkt 13, ANN-204) und liefert den Code einmal. Prueft Art, Alter, Nachweis und Einwilligung an einer Stelle (app.assert_platform_representation). Rollen, die das Verhaeltnis schreiben; abgewiesen mit denied und HTTP 403.';

-- -----------------------------------------------------------------------------
-- 8. Ein neuer Code fuer eine Vertretung: eine neue Einladung, solange sie
--    eingeladen ist, oder ein neues Kennwort, wenn sie aktiv ist (Punkt 10).
-- -----------------------------------------------------------------------------
create function public.renew_platform_representation_code(p_access_id uuid)
returns table (
  access_id     uuid,
  invitation_id uuid,
  purpose       text,
  code          text,
  expires_at    timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor   uuid;
  v_org     uuid;
  v_access  public.platform_accesses%rowtype;
  v_purpose text;
  v_inv     record;
  v_minderjaehrig boolean;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  v_org := app.current_organization_id();

  v_access := app.platform_access_for_update(p_access_id, v_org);
  if v_access.id is null or not app.can_manage_platform_access(v_access.relationship_kind) then
    perform app.record_denied_write(v_actor, 'platform_access.invited', 'not allowed to manage platform access');
    return;
  end if;

  if v_access.access_kind = 'self' then
    raise exception 'use invite_platform_access for the person' using errcode = '22023';
  end if;
  -- Eine abgelaufene Lesefrist bekommt keinen neuen Code, und keine
  -- Vertretung, deren Art nicht mehr zum Alter passt - auch nicht als offene
  -- Einladung (Zweitreview; Punkt 15, ANN-208): ein Sorgerecht ab 18, jede
  -- andere Art unter 18 oder ohne Geburtsdatum.
  v_minderjaehrig := app.platform_is_minor(
    (select r.date_of_birth
       from app.platform_relationship(v_access.relationship_kind, v_access.relationship_id) r),
    (select o.time_zone from public.organizations o where o.id = v_org)
  );
  if (v_access.status = 'active'
      and coalesce(app.platform_access_ended_at(v_access.id) <= now(), false))
     or v_minderjaehrig is null
     or v_minderjaehrig <> (v_access.legal_basis is not distinct from 'custody') then
    raise exception 'platform access has ended' using errcode = '22023';
  end if;

  if v_access.status = 'invited' then
    v_purpose := 'activate';
  elsif v_access.status = 'active' then
    v_purpose := 'reset';
    -- Wie POR-002: Ein neues Kennwort gilt fuer das ganze Konto. Zweitreview:
    -- auch ueber Organisationen hinweg - die Rolle hier gilt nur hier.
    if exists (
      select 1 from public.platform_accesses b
      where b.account_user_id = v_access.account_user_id
        and b.status <> 'revoked'
        and (b.organization_id <> v_org or not app.can_manage_platform_access(b.relationship_kind))
    ) then
      raise exception 'reset needs every area of this account' using errcode = '22023';
    end if;
  elsif v_access.status = 'locked' then
    raise exception 'platform access is locked' using errcode = '22023';
  else
    raise exception 'platform access is already revoked' using errcode = '22023';
  end if;

  select * into v_inv from app.issue_platform_invitation(v_org, v_access.id, v_purpose, v_actor);

  perform app.log_platform_access_event(
    v_org, v_actor, 'user', 'platform_access.invited', v_access.id,
    jsonb_build_object('surface', 'web', 'channel', 'on_site', 'purpose', v_purpose,
                       'relationship_kind', v_access.relationship_kind,
                       'access_kind', v_access.access_kind)
  );

  return query select v_access.id, v_inv.invitation_id, v_purpose, v_inv.code, v_inv.expires_at;
end;
$$;

revoke all on function public.renew_platform_representation_code(uuid) from public, anon;
grant execute on function public.renew_platform_representation_code(uuid) to authenticated;

comment on function public.renew_platform_representation_code(uuid) is
  'POR-005: neuer Code vor Ort fuer eine Vertretung - Einladung, solange eingeladen, neues Kennwort, wenn aktiv (ADR-023 Punkt 10). Rollen, die das Verhaeltnis schreiben; abgewiesen mit denied und HTTP 403.';

-- -----------------------------------------------------------------------------
-- 9. Zweifel an der Einwilligungsfaehigkeit (Punkt 13; ANN-207)
--
-- Es gibt dann keine Begleitung, nur die rechtliche Vertretung. Vermerkt wird
-- DASS gezweifelt wurde, von wem und wann - kein Grund, keine Diagnose.
-- -----------------------------------------------------------------------------
create function public.note_companion_capacity_doubt(p_relationship_kind text, p_relationship_id uuid)
returns boolean
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
  if not app.can_manage_platform_access(p_relationship_kind) then
    perform app.record_denied_write(v_actor, 'platform_access.companion_declined', 'not allowed to manage platform access');
    return null;
  end if;
  v_org := app.current_organization_id();

  if not exists (
    select 1 from app.platform_relationship(p_relationship_kind, p_relationship_id) r
    where r.organization_id = v_org
  ) then
    raise exception 'relationship not found' using errcode = 'P0002';
  end if;

  insert into public.audit_log (
    organization_id, actor_user_id, actor_kind, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'user', 'platform_access.companion_declined',
    case p_relationship_kind when 'treatment' then 'patient' else 'training_relationship' end,
    p_relationship_id, 'success',
    jsonb_build_object('surface', 'web', 'reason', 'capacity_doubt')
  );
  return true;
end;
$$;

revoke all on function public.note_companion_capacity_doubt(text, uuid) from public, anon;
grant execute on function public.note_companion_capacity_doubt(text, uuid) to authenticated;

comment on function public.note_companion_capacity_doubt(text, uuid) is
  'POR-005: vermerkt, dass die Praxis an der Einwilligungsfaehigkeit zweifelt und deshalb keine Begleitung einrichtet (ADR-023 Punkt 13, ANN-207). Nur der Vorgang, kein Grund. Abgewiesen mit denied und HTTP 403.';

-- -----------------------------------------------------------------------------
-- 10. Lesen: die Vertretungen eines Verhaeltnisses fuer den Abschnitt
--     "Plattform". Kein Konto, keine Adresse, kein Code.
-- -----------------------------------------------------------------------------
create function public.list_platform_representations(p_relationship_kind text, p_relationship_id uuid)
returns table (
  id                        uuid,
  access_kind               text,
  legal_basis               text,
  representative_name       text,
  status                    text,
  created_at                timestamptz,
  activated_at              timestamptz,
  locked_at                 timestamptz,
  revoked_at                timestamptz,
  revoked_reason            text,
  proof_documents           text[],
  guardianship_health_scope boolean,
  proof_recorded_at         timestamptz,
  proof_recorded_by_name    text,
  consent_recorded_at       timestamptz,
  consent_earlier_messages  boolean,
  invitation_purpose        text,
  invitation_expires_at     timestamptz,
  ended_at                  timestamptz
)
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
  if not app.can_read_platform_access(p_relationship_kind) then
    perform app.record_denied_read(v_actor, 'platform_accesses.read', 'not allowed to read platform access');
    return;
  end if;
  v_org := app.current_organization_id();

  return query
  select a.id, a.access_kind, a.legal_basis, a.representative_name, a.status,
         a.created_at, a.activated_at, a.locked_at, a.revoked_at, a.revoked_reason,
         a.proof_documents, a.guardianship_health_scope, a.proof_recorded_at,
         up.display_name, a.consent_recorded_at, a.consent_earlier_messages,
         i.purpose, i.expires_at,
         app.platform_access_ended_at(a.id)
  from public.platform_accesses a
  left join public.user_profiles up
    on up.id = a.proof_recorded_by and up.organization_id = v_org
  left join public.platform_access_invitations i
    on i.platform_access_id = a.id and i.status = 'pending' and i.expires_at > now()
  where a.organization_id = v_org
    and a.relationship_kind = p_relationship_kind
    and a.relationship_id = p_relationship_id
    and a.access_kind <> 'self'
    -- Das Verhaeltnis muss leben; der Nachweis eines geloeschten bleibt
    -- unsichtbar (ADR-023 Punkt 5).
    and (a.patient_id is not null or a.training_relationship_id is not null)
  order by (a.status = 'revoked'), a.created_at desc;
end;
$$;

revoke all on function public.list_platform_representations(text, uuid) from public, anon;
grant execute on function public.list_platform_representations(text, uuid) to authenticated;

comment on function public.list_platform_representations(text, uuid) is
  'POR-005: Vertretungen eines Verhaeltnisses mit Art, Name der vertretenden Person, Nachweis und Zustand fuer den Abschnitt "Plattform". Rollen, die das Verhaeltnis lesen; abgewiesen mit denied (platform_accesses.read). Ohne Konto, Adresse und Code.';

-- -----------------------------------------------------------------------------
-- 11. Zweitreview: Neues Kennwort fuer den eigenen Zugang nur, wenn das Konto
--     keinen lebenden Zugang in einer anderen Organisation hat. Sonst
--     unveraendert aus POR-002.
-- -----------------------------------------------------------------------------
create or replace function public.invite_platform_access(
  p_relationship_kind text,
  p_relationship_id   uuid,
  p_channel           text,
  p_address_confirmed boolean default false
)
returns table (
  access_id     uuid,
  invitation_id uuid,
  purpose       text,
  code          text,
  expires_at    timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor   uuid;
  v_org     uuid;
  v_rel     record;
  v_access  public.platform_accesses%rowtype;
  v_purpose text;
  v_code    text;
  v_inv     uuid;
  v_expires timestamptz;
  v_email   text;
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

  if p_channel is null or p_channel not in ('on_site', 'email') then
    raise exception 'unknown channel' using errcode = '22023';
  end if;

  select * into v_rel
  from app.platform_relationship(p_relationship_kind, p_relationship_id) r
  where r.organization_id = v_org;
  if not found then
    raise exception 'relationship not found' using errcode = 'P0002';
  end if;

  -- Punkt 15 (W4): Unter 18 gibt es keinen eigenen Zugang. Ohne Geburtsdatum
  -- laesst sich das nicht pruefen, und die restriktive Seite gilt (§16,
  -- ANN-190).
  if v_rel.date_of_birth is null then
    raise exception 'date of birth required' using errcode = '22023';
  end if;
  -- W1 (Punkt 2): eine Person mit Praxiskonto bekommt keinen Zugang.
  if exists (
    select 1 from public.user_profiles up
    join public.user_roles ur on ur.user_id = up.id
    where up.person_id = v_rel.person_id
  ) then
    raise exception 'person has a practice account' using errcode = '22023';
  end if;
  if v_rel.date_of_birth > (now() at time zone 'UTC')::date
                           - make_interval(years => app.platform_min_age_years()) then
    raise exception 'person is under age' using errcode = '22023';
  end if;

  -- Punkt 11 (Fassung 2, ANN-188): Mail nur an die Adresse im Verhaeltnis,
  -- und nur, wenn die einladende Person vermerkt, dass die Person sie selbst
  -- bestaetigt hat.
  if p_channel = 'email' then
    if v_rel.email is null then
      raise exception 'no email address on record' using errcode = '22023';
    end if;
    if not coalesce(p_address_confirmed, false) then
      raise exception 'address must be confirmed by the person' using errcode = '22023';
    end if;
    v_email := v_rel.email;
  end if;

  select * into v_access
  from public.platform_accesses a
  where a.relationship_id = p_relationship_id
    and a.relationship_kind = p_relationship_kind
    and a.access_kind = 'self'
    and a.status <> 'revoked'
  for update;

  if not found then
    insert into public.platform_accesses (
      organization_id, relationship_kind, relationship_id,
      patient_id, training_relationship_id, created_by
    )
    values (
      v_org, p_relationship_kind, p_relationship_id,
      case when p_relationship_kind = 'treatment' then p_relationship_id end,
      case when p_relationship_kind = 'training' then p_relationship_id end,
      v_actor
    )
    returning * into v_access;
    v_purpose := 'activate';
  elsif v_access.status = 'invited' then
    v_purpose := 'activate';
  elsif v_access.status = 'active' then
    v_purpose := 'reset';
    -- Zweitreview: Ein neues Kennwort gilt fuer das ganze Konto und damit
    -- fuer jeden seiner Zugaenge. Ausstellen darf es nur, wer alle lebenden
    -- Zugaenge des Kontos verwalten darf - sonst oeffnete die
    -- Trainingsbetreuung den Weg in die Behandlung und umgekehrt (§4.8).
    if exists (
      select 1 from public.platform_accesses b
      where b.account_user_id = v_access.account_user_id
        and b.status <> 'revoked'
        -- POR-005, Zweitreview: auch ueber Organisationen hinweg. Die Rolle
        -- gilt nur in der eigenen Praxis; ein Konto mit Zugang in einer
        -- zweiten Praxis bekommt hier kein neues Kennwort.
        and (b.organization_id <> v_org or not app.can_manage_platform_access(b.relationship_kind))
    ) then
      raise exception 'reset needs every area of this account' using errcode = '22023';
    end if;
  else
    raise exception 'platform access is locked' using errcode = '22023';
  end if;

  update public.platform_access_invitations i
     set status = 'revoked', revoked_at = now()
   where i.platform_access_id = v_access.id and i.status = 'pending';

  -- 24 Zufallsbytes, URL-tauglich kodiert: 32 Zeichen, nicht zu erraten.
  v_code := translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/', '-_');
  v_expires := now() + app.platform_invitation_validity();

  insert into public.platform_access_invitations (
    organization_id, platform_access_id, purpose, channel, code_hash, email,
    address_confirmed_by, address_confirmed_at, expires_at, created_by
  )
  values (
    v_org, v_access.id, v_purpose, p_channel, app.platform_code_hash(v_code), v_email,
    case when p_channel = 'email' then v_actor end,
    case when p_channel = 'email' then now() end,
    v_expires, v_actor
  )
  returning id into v_inv;

  perform app.log_platform_access_event(
    v_org, v_actor, 'user', 'platform_access.invited', v_access.id,
    jsonb_build_object('surface', 'web', 'channel', p_channel, 'purpose', v_purpose,
                       'relationship_kind', p_relationship_kind)
  );

  return query select v_access.id, v_inv, v_purpose, v_code, v_expires;
end;
$$;

revoke all on function public.invite_platform_access(text, uuid, text, boolean) from public, anon;
grant execute on function public.invite_platform_access(text, uuid, text, boolean) to authenticated;

comment on function public.invite_platform_access(text, uuid, text, boolean) is
  'POR-002: laedt zu einem Plattformzugang ein (vor Ort oder per Mail an die bestaetigte Adresse, ANN-188) und liefert den Code einmal. Rollen, die das Verhaeltnis schreiben (ADR-023 Punkt 6); abgewiesen mit denied und HTTP 403.';

-- -----------------------------------------------------------------------------
-- 12. Widerruf einer Begleitung, erklaert in der Praxis (Punkte 5, 13)
--
-- Zweitreview: Der Wortlaut der Einwilligung sagt "widerrufen bei der Praxis
-- oder unter 'Ich'". Erklaert die Person den Widerruf in der Praxis, steht er
-- als Widerruf im Nachweis (`consent_withdrawn`), nicht als Entziehen durch
-- die Praxis. Wirkung wie ein Entziehen.
-- -----------------------------------------------------------------------------
create function public.record_companion_consent_withdrawn(p_access_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor  uuid;
  v_org    uuid;
  v_access public.platform_accesses%rowtype;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  v_org := app.current_organization_id();

  v_access := app.platform_access_for_update(p_access_id, v_org);
  if v_access.id is null or not app.can_manage_platform_access(v_access.relationship_kind) then
    perform app.record_denied_write(v_actor, 'platform_access.revoked', 'not allowed to manage platform access');
    return null;
  end if;
  if v_access.access_kind <> 'companion' then
    raise exception 'only a companion rests on consent' using errcode = '22023';
  end if;
  if v_access.status = 'revoked' then
    raise exception 'platform access is already revoked' using errcode = '22023';
  end if;

  update public.platform_accesses
     set status = 'revoked', revoked_at = now(), revoked_by = v_actor,
         revoked_reason = 'consent_withdrawn', locked_at = null, locked_by = null
   where id = v_access.id;

  update public.platform_access_invitations
     set status = 'revoked', revoked_at = now()
   where platform_access_id = v_access.id and status = 'pending';

  perform app.log_platform_access_event(
    v_org, v_actor, 'user', 'platform_access.revoked', v_access.id,
    jsonb_build_object('surface', 'web', 'reason', 'consent_withdrawn',
                       'previous_status', v_access.status)
  );
  return 'revoked';
end;
$$;

revoke all on function public.record_companion_consent_withdrawn(uuid) from public, anon;
grant execute on function public.record_companion_consent_withdrawn(uuid) to authenticated;

comment on function public.record_companion_consent_withdrawn(uuid) is
  'POR-005: vermerkt den in der Praxis erklaerten Widerruf der Einwilligung zur Begleitung (ADR-023 Punkte 5, 13) und beendet sie mit Grund consent_withdrawn. Rollen, die das Verhaeltnis schreiben; abgewiesen mit denied und HTTP 403.';
