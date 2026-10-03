-- =============================================================================
-- LOG-EPIC-001, PR (b): Schreibvorgaenge weist das Datenmodell nach
-- (Freigabe Jannes, 2026-10-03; ANN-230)
--
-- Erstellen, Aendern, Finalisieren, Ausstellen, Stornieren, Absagen und die
-- uebrigen Schreibvorgaenge stehen nicht mehr im Auditlog. Wer und wann zeigen
-- die Spalten der Fachtabellen (created_by, finalized_by, issued_by,
-- cancelled_by, Versionstabelle der Dokumentation ...). Wo das Datenmodell
-- wer/wann nicht abbildete, schliesst diese Migration die Luecke minimal:
--
--   * appointments.reopened_at/reopened_by: reopen_appointment leert
--     completed_*/no_show_*; die letzte Ruecknahme bleibt sichtbar.
--   * storage_deletion_orders.ordered_by: wer eine Datei geloescht hat. Der
--     Trigger an patient_files schreibt den Auftrag; der Vorgabewert nimmt das
--     angemeldete Konto, im Loeschlauf ohne Sitzung bleibt er leer (System).
--   * platform_accesses.companion_declined_*: der Zweifel an der
--     Einwilligungsfaehigkeit (ADR-023 Punkt 13) als fachliches Feld am
--     Zugang der rechtlichen Vertretung statt als Auditeintrag (ANN-207,
--     Fassung 2). Ohne Freitext; aufbewahrt wie die Akte.
--
-- Im Auditlog bleiben genau 26 Aktionen (ADR-010, Soll-Liste).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Luecken im Datenmodell
-- -----------------------------------------------------------------------------
alter table public.appointments
  add column reopened_at timestamptz,
  add column reopened_by uuid;

alter table public.appointments add constraint appointments_reopened_complete
  check ((reopened_at is null) = (reopened_by is null));

comment on column public.appointments.reopened_by is
  'Wer den Abschluss oder das Nichtantreffen zuletzt zurueckgenommen hat (LOG-EPIC-001). Bewusst ohne FK wie created_by.';

alter table public.storage_deletion_orders
  add column ordered_by uuid default auth.uid();

comment on column public.storage_deletion_orders.ordered_by is
  'Wer die Loeschung ausgeloest hat; leer, wenn ein zeitgesteuerter Vorgang loescht (LOG-EPIC-001).';

alter table public.platform_accesses
  add column companion_declined_at     timestamptz,
  add column companion_declined_by     uuid,
  add column companion_declined_reason text;

alter table public.platform_accesses add constraint platform_accesses_companion_declined_shape
  check (
    (companion_declined_at is null and companion_declined_by is null and companion_declined_reason is null)
    or (companion_declined_at is not null and companion_declined_by is not null
        and companion_declined_reason = 'capacity_doubt'
        and access_kind = 'legal_representative')
  );

comment on column public.platform_accesses.companion_declined_reason is
  'ADR-023 Punkt 13: keine Begleitung, weil die Praxis an der Einwilligungsfaehigkeit zweifelt. Fester Wert, kein Freitext, keine Diagnose (ANN-207).';

-- -----------------------------------------------------------------------------
-- 2. Der abschliessende Katalog: 26 Aktionen, 8 Gegenstaende (ADR-010)
--
-- Bestehende Zeilen entfallender Aktionen werden geloescht (nur synthetische
-- Daten, kein Produktivbetrieb). Der Zweifel an der Einwilligungsfaehigkeit
-- hatte nur den Auditeintrag; er geht mit, wie jeder Testbestand.
-- -----------------------------------------------------------------------------
alter table public.audit_log drop constraint audit_log_action_check;
alter table public.audit_log drop constraint audit_log_subject_type_check;

delete from public.audit_log
 where action not in (
    'patient_record.viewed',
    'training_relationship.viewed',
    'patient_file.downloaded',
    'patient_record.exported',
    'therapy_report.exported',
    'patient_file.handed_out',
    'platform_representation.read',
    'platform_access.invited',
    'platform_access.activated',
    'platform_access.locked',
    'platform_access.unlocked',
    'platform_access.revoked',
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
    'organization.bootstrapped',
    'access.denied',
    'retention.applied'
 );

alter table public.audit_log add constraint audit_log_action_check
  check (action in (
    'patient_record.viewed',
    'training_relationship.viewed',
    'patient_file.downloaded',
    'patient_record.exported',
    'therapy_report.exported',
    'patient_file.handed_out',
    'platform_representation.read',
    'platform_access.invited',
    'platform_access.activated',
    'platform_access.locked',
    'platform_access.unlocked',
    'platform_access.revoked',
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
    'organization.bootstrapped',
    'access.denied',
    'retention.applied'
  ));

alter table public.audit_log add constraint audit_log_subject_type_check
  check (subject_type in (
    'patient',
    'training_relationship',
    'patient_file',
    'therapy_report',
    'platform_access',
    'staff_member',
    'user_account',
    'organization'
  ));
