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
