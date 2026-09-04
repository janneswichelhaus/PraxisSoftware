-- =============================================================================
-- Audit-Ereigniskatalog: Mitarbeiterverwaltung und Behandlungsdokumentation
-- zusammenfuehren
--
-- STAFF-001 (20260830140000_staff_management.sql) und DOK-001/DOK-002
-- (20260901100000_treatment_notes.sql,
-- 20260902100000_treatment_note_finalisation.sql) sind auf getrennten Branches
-- entstanden. Jede dieser Migrationen ersetzt audit_log_action_check und
-- audit_log_subject_type_check durch die vollstaendige Liste ihres eigenen
-- Standes. In der Migrationsreihenfolge gewinnt der spaetere Stand - und der
-- kennt die Mitarbeiterverwaltung nicht: nach 20260902100000 fehlen
-- staff_member.created, staff_member.updated, staff_member.status_changed und
-- der Subjekttyp staff_member im Katalog. Jeder Schreibvorgang der
-- Mitarbeiterverwaltung wuerde damit an der Check-Constraint scheitern.
--
-- Diese Migration stellt die Vereinigung beider Kataloge her. Der Katalog in
-- src/features/audit/actions.ts wird durch den Datenbanktest "Ereigniskatalog"
-- deckungsgleich gehalten (ADR-010).
-- =============================================================================

alter table public.audit_log drop constraint audit_log_action_check;
alter table public.audit_log add constraint audit_log_action_check
  check (action in (
    'patient_record.viewed',
    'audit_log.read',
    'patient.created',
    'patient.updated',
    'patient.status_changed',
    'appointment.created',
    'appointment.updated',
    'appointment.rescheduled',
    'appointment.cancelled',
    'appointment.completed',
    'appointment.reopened',
    'organization.appointment_grid_changed',
    'staff_working_hours.created',
    'staff_working_hours.updated',
    'staff_working_hours.removed',
    'staff_working_hour_exception.created',
    'staff_working_hour_exception.updated',
    'staff_working_hour_exception.removed',
    'staff_member.created',
    'staff_member.updated',
    'staff_member.status_changed',
    'treatment_note.created',
    'treatment_note.updated',
    'treatment_note.viewed',
    'treatment_note.finalized',
    'treatment_note.revised',
    'treatment_note.addendum_created',
    'treatment_note.history_viewed'
  ));

alter table public.audit_log drop constraint audit_log_subject_type_check;
alter table public.audit_log add constraint audit_log_subject_type_check
  check (subject_type in (
    'patient',
    'organization',
    'appointment',
    'staff_working_hours',
    'staff_working_hour_exception',
    'staff_member',
    'treatment_note'
  ));
