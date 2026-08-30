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
};

export const auditSubjectLabels: Record<string, string> = {
  patient: 'Patient:in',
  organization: 'Organisation',
  appointment: 'Termin',
};

export const auditOutcomeLabels: Record<string, string> = {
  success: 'Erfolgreich',
  denied: 'Abgewiesen',
};
