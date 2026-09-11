import { z } from 'zod';

export const roleKeySchema = z.enum(['owner', 'therapist', 'team_lead', 'office', 'patient']);
export type RoleKey = z.infer<typeof roleKeySchema>;

export const userProfileSchema = z.object({
  id: z.string(),
  organization_id: z.string(),
  person_id: z.string(),
  display_name: z.string(),
});
export type UserProfile = z.infer<typeof userProfileSchema>;

export interface CurrentUser {
  profile: UserProfile;
  roles: RoleKey[];
  organizationName: string | null;
  /** IANA-Zeitzone der Praxis. Massgeblich fuer Termine (CAL-001). */
  organizationTimeZone: string | null;
  /**
   * Minutenraster fuer den Beginn von Terminen (CAL-005).
   *
   * Steuert ausschliesslich die Schrittweite der Eingabefelder. Verbindlich
   * prueft der Server; `null` heisst nur, dass der Wert noch nicht geladen ist.
   */
  appointmentGridMinutes: number | null;
  /**
   * Die eigene Beschaeftigtenkennung - `null` fuer ein Patientenkonto.
   *
   * Sie beantwortet die Frage "ich": welche Besuche des Tages sind meine, und
   * wer ist beim Anlegen eines Termins vorbelegt (UX-001, UX-003). Ein Abgleich
   * ueber den Anzeigenamen waere dafuer untauglich - im Team koennen zwei
   * Personen sehr aehnlich heissen.
   *
   * Sie steuert ausschliesslich die Darstellung und Vorbelegung. Verbindlich
   * prueft der Server, wer einem Termin zugeordnet werden darf (ADR-004).
   */
  staffMemberId: string | null;
}

/** Rollen mit Zugriff auf die Patientenkartei (PROJECT_PRINCIPLES.md 4.2/4.3). */
const directoryRoles: RoleKey[] = ['owner', 'therapist', 'team_lead', 'office'];

export function canReadPatientDirectory(roles: readonly RoleKey[]): boolean {
  return roles.some((role) => directoryRoles.includes(role));
}

/**
 * Rollen, die den Versorgungsstatus wechseln duerfen.
 *
 * Enger als die Kartei: behandelnde Therapeut:innen dokumentieren, verwalten
 * aber nicht den Patientenbestand. Steuert ausschliesslich die Darstellung -
 * verbindlich ist app.can_change_patient_status() in der Datenbank.
 */
const statusRoles: RoleKey[] = ['owner', 'team_lead', 'office'];

export function canChangePatientStatus(roles: readonly RoleKey[]): boolean {
  return roles.some((role) => statusRoles.includes(role));
}

/**
 * Rollen, die Termine planen duerfen.
 *
 * Terminplanung ist ein organisatorischer Vorgang: alle vier Praxisrollen
 * duerfen ihn. Steuert ausschliesslich die Darstellung - verbindlich ist
 * app.can_create_appointment() in der Datenbank.
 */
const appointmentRoles: RoleKey[] = ['owner', 'therapist', 'team_lead', 'office'];

export function canManageAppointments(roles: readonly RoleKey[]): boolean {
  return roles.some((role) => appointmentRoles.includes(role));
}

/**
 * Rollen mit Lesezugriff auf klinische Behandlungsdokumentation.
 *
 * office ist bewusst nicht dabei (PROJECT_PRINCIPLES.md 4.3), owner schon
 * (4.1). Steuert ausschliesslich die Darstellung - verbindlich ist
 * app.can_read_treatment_note() in der Datenbank, und gelesen wird
 * ausschliesslich ueber get_treatment_note.
 */
const clinicalReadRoles: RoleKey[] = ['owner', 'therapist', 'team_lead'];

export function canReadTreatmentNote(roles: readonly RoleKey[]): boolean {
  return roles.some((role) => clinicalReadRoles.includes(role));
}

/**
 * Rollen mit Zugriff auf die organisatorische Sicht einer Verordnung.
 *
 * Alle vier Praxisrollen: office plant Termine daraus und fordert
 * Folgeverordnungen an (PROJECT_PRINCIPLES.md 4.3). Steuert ausschliesslich
 * die Darstellung - verbindlich ist app.can_read_prescriptions() in der
 * Datenbank, und gelesen wird ausschliesslich ueber
 * list_patient_prescriptions.
 */
export function canReadPrescriptions(roles: readonly RoleKey[]): boolean {
  return roles.some((role) => directoryRoles.includes(role));
}

/**
 * Rollen mit Zugriff auf die klinischen Felder einer Verordnung.
 *
 * Deckungsgleich mit canReadTreatmentNote: die Verordnung oeffnet keinen
 * zweiten Weg zu klinischem Freitext (4.3, ANN-011). Verbindlich ist
 * app.can_read_prescription_clinical().
 */
export function canReadPrescriptionClinical(roles: readonly RoleKey[]): boolean {
  return roles.some((role) => clinicalReadRoles.includes(role));
}

/**
 * Rollen, die Verordnungen anlegen, aendern und loeschen duerfen.
 *
 * Ohne office (ANN-011): wer eine Verordnung erfasst, tippt die Diagnose mit
 * ab. Verbindlich ist app.can_write_prescriptions().
 */
export function canWritePrescriptions(roles: readonly RoleKey[]): boolean {
  return roles.some((role) => clinicalReadRoles.includes(role));
}

/**
 * Rollen, die dokumentieren duerfen.
 *
 * Enger als das Lesen: Dokumentieren ist ein Behandlungsschritt (4.2), kein
 * Verwaltungsvorgang. Ein reiner owner-Zugang liest die Akte, schreibt aber
 * keine Behandlungsdokumentation. Verbindlich ist
 * app.can_write_treatment_note().
 */
const clinicalWriteRoles: RoleKey[] = ['therapist', 'team_lead'];

export function canWriteTreatmentNote(roles: readonly RoleKey[]): boolean {
  return roles.some((role) => clinicalWriteRoles.includes(role));
}

/**
 * Rollen mit Zugriff auf den Behandlungsnachweis in der Akte (DOK-003).
 *
 * Alle vier Praxisrollen: fuer office ist er der einzige Blick auf den
 * Dokumentationsstand (PROJECT_PRINCIPLES.md 4.4), die klinischen Rollen
 * bekommen in der Akte die Sicht mit Inhalt. Steuert ausschliesslich die
 * Darstellung - verbindlich ist app.can_read_treatment_evidence() in der
 * Datenbank (ANN-006).
 */
const evidenceRoles: RoleKey[] = ['owner', 'therapist', 'team_lead', 'office'];

export function canReadTreatmentEvidence(roles: readonly RoleKey[]): boolean {
  return roles.some((role) => evidenceRoles.includes(role));
}

/** Rollen, die den Dienstplan pflegen duerfen. therapist liest ihn nur (CAL-005). */
const workingHourRoles: RoleKey[] = ['owner', 'team_lead', 'office'];

export function canManageWorkingHours(roles: readonly RoleKey[]): boolean {
  return roles.some((role) => workingHourRoles.includes(role));
}

/**
 * Rollen, die Mitarbeiterdatensaetze verwalten duerfen (STAFF-001).
 *
 * Abgeleitet aus PROJECT_PRINCIPLES.md 4.1: "Mitarbeiter" und
 * "Personalprozesse" stehen dort ausdruecklich beim Praxisinhaber. Fuer Office
 * (4.3 "Mitarbeiterorganisation") und Teamleitung (4.5, ausdruecklich nur
 * MOEGLICHE Zusatzrechte) liegt keine Entscheidung vor; fuer schreibende
 * Vorgaenge gilt bis dahin 13. Steuert ausschliesslich die Darstellung -
 * verbindlich ist app.can_manage_staff() in der Datenbank.
 */
export function canManageStaff(roles: readonly RoleKey[]): boolean {
  return roles.includes('owner');
}

/** Administrative Praxisberechtigung (PROJECT_PRINCIPLES.md 4.1). */
export function isOwner(roles: readonly RoleKey[]): boolean {
  return roles.includes('owner');
}

export function isStaff(roles: readonly RoleKey[]): boolean {
  return roles.some((role) => role !== 'patient');
}
