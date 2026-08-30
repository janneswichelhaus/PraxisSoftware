/**
 * Katalog der auditpflichtigen Aktionen (ADR-010).
 *
 * Diese Liste MUSS deckungsgleich mit der Check-Constraint auf
 * public.audit_log.action sein. Ein Datenbanktest prüft das gegeneinander -
 * andernfalls würde ein neues Ereignis in der Oberfläche fehlen oder ein
 * Filterwert ins Leere laufen.
 */
export const AUDIT_ACTIONS = [
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
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const auditActionLabels: Record<AuditAction, string> = {
  'patient_record.viewed': 'Patientenakte geöffnet',
  'audit_log.read': 'Auditlog gelesen',
  'patient.created': 'Patient:in angelegt',
  'patient.updated': 'Stammdaten geändert',
  'patient.status_changed': 'Versorgungsstatus geändert',
  'appointment.created': 'Termin angelegt',
  'appointment.updated': 'Termin geändert',
  'appointment.rescheduled': 'Termin verschoben',
  'appointment.cancelled': 'Termin abgesagt',
  'appointment.completed': 'Termin abgeschlossen',
  'appointment.reopened': 'Termin wieder geöffnet',
  'organization.appointment_grid_changed': 'Praxisraster geändert',
  'staff_working_hours.created': 'Wochenarbeitszeit angelegt',
  'staff_working_hours.updated': 'Wochenarbeitszeit geändert',
  'staff_working_hours.removed': 'Wochenarbeitszeit entfernt',
  'staff_working_hour_exception.created': 'Abweichung angelegt',
  'staff_working_hour_exception.updated': 'Abweichung geändert',
  'staff_working_hour_exception.removed': 'Abweichung aufgehoben',
};

export const auditSubjectLabels: Record<string, string> = {
  patient: 'Patient:in',
  organization: 'Organisation',
  appointment: 'Termin',
  staff_working_hours: 'Wochenarbeitszeit',
  staff_working_hour_exception: 'Arbeitszeitabweichung',
};

export const auditOutcomeLabels: Record<string, string> = {
  success: 'Erfolgreich',
  denied: 'Abgewiesen',
};
