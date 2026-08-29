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
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const auditActionLabels: Record<AuditAction, string> = {
  'patient_record.viewed': 'Patientenakte geöffnet',
  'audit_log.read': 'Auditlog gelesen',
  'patient.created': 'Patient:in angelegt',
};

export const auditSubjectLabels: Record<string, string> = {
  patient: 'Patient:in',
  organization: 'Organisation',
};

export const auditOutcomeLabels: Record<string, string> = {
  success: 'Erfolgreich',
  denied: 'Abgewiesen',
};
