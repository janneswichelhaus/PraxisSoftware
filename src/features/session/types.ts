import { z } from 'zod';

export const roleKeySchema = z.enum(['owner', 'therapist', 'team_lead', 'office', 'patient']);
export type RoleKey = z.infer<typeof roleKeySchema>;

export const userProfileSchema = z.object({
  id: z.string(),
  organization_id: z.string(),
  person_id: z.string(),
  display_name: z.string(),
  /**
   * Ist der Zugang freigeschaltet (STAFF-003)?
   *
   * Ein gesperrter Zugang darf seine eigene Profilzeile weiterhin lesen -
   * sonst koennte die Anwendung "gesperrt" nicht von "nie eingerichtet"
   * unterscheiden und zeigte eine irrefuehrende Seite (13). Ausgeliefert wird
   * damit nichts Geschuetztes: jede andere Policy laeuft fuer ihn ins Leere.
   */
  is_active: z.boolean(),
});
type UserProfile = z.infer<typeof userProfileSchema>;

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
 * Rollen mit Zugriff auf die Dateien einer Akte (DAT-001, ADR-017 Punkt 12).
 *
 * Alle vier Praxisrollen - aber office sieht nur die ORGANISATORISCHEN
 * Dokumentarten. Welche das sind, entscheidet der Katalog in der Datenbank;
 * verbindlich sind app.can_read_patient_files() und
 * app.can_see_patient_file_type(). Diese Funktion steuert nur, ob der Bereich
 * in der Akte ueberhaupt auftaucht.
 */
export function canReadPatientFiles(roles: readonly RoleKey[]): boolean {
  return roles.some((role) => directoryRoles.includes(role));
}

/**
 * Rollen, die klinische Dateien sehen duerfen (ADR-017 Punkt 12).
 *
 * Ohne office - und das schliesst den Verordnungsscan ein, obwohl office die
 * Verordnungsdaten organisatorisch sieht (ANN-011): Ein Scan zeigt das ganze
 * Blatt samt Diagnose und laesst sich nicht projizieren. Verbindlich ist
 * app.can_read_clinical_patient_files().
 */
export function canReadClinicalPatientFiles(roles: readonly RoleKey[]): boolean {
  return roles.some((role) => clinicalReadRoles.includes(role));
}

/**
 * Rollen, die den Abschluss der Versorgung setzen duerfen (LOE-001b).
 *
 * Wie beim Schreiben von Verordnungen: owner, therapist, team_lead - ohne
 * office. Ob eine Behandlung abgeschlossen ist, ist eine fachliche Aussage
 * ueber den Versorgungsverlauf und kein Verwaltungsvorgang; sie startet die
 * zehnjaehrige Aufbewahrung (ADR-008). Verbindlich ist
 * app.can_conclude_patient_care().
 */
export function canConcludePatientCare(roles: readonly RoleKey[]): boolean {
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
 * Rollen, die Mitarbeiterstammdaten anlegen und aendern duerfen (E10).
 *
 * owner und office: 4.3 nennt fuer das Office woertlich die
 * "Mitarbeiterorganisation". Steuert ausschliesslich die Darstellung -
 * verbindlich ist app.can_manage_staff_master_data() in der Datenbank.
 */
const staffMasterDataRoles: RoleKey[] = ['owner', 'office'];

export function canManageStaffMasterData(roles: readonly RoleKey[]): boolean {
  return roles.some((role) => staffMasterDataRoles.includes(role));
}

/**
 * Rollen, die die Privatangaben einer beschaeftigten Person schreiben duerfen.
 *
 * Deckungsgleich mit dem Leserecht aus 20: nur owner. Wer sie nicht lesen darf,
 * bekaeme sie im Formular als leere Felder und wuerde sie beim Speichern
 * loeschen - ein Schreibrecht ohne Leserecht waere hier nicht restriktiver,
 * sondern gefaehrlich (ANN-024). Verbindlich ist
 * app.can_manage_staff_private_details().
 */
export function canManageStaffPrivateDetails(roles: readonly RoleKey[]): boolean {
  return roles.includes('owner');
}

/**
 * Rollen, die den Beschaeftigungsstatus wechseln duerfen (E10).
 *
 * Nur owner: der Wechsel nimmt eine Person aus dem laufenden Einsatz und hat
 * arbeitsrechtliche Wirkung. Verbindlich ist
 * app.can_manage_staff_employment().
 */
export function canManageStaffEmployment(roles: readonly RoleKey[]): boolean {
  return roles.includes('owner');
}

/**
 * Rollen, die Zugaenge einladen, Rollen vergeben und Konten sperren duerfen.
 *
 * Nur owner: Berechtigungsvergabe ist eine Sicherheitsentscheidung nach
 * ADR-004 (E10). Verbindlich ist app.can_manage_staff_accounts().
 */
export function canManageStaffAccounts(roles: readonly RoleKey[]): boolean {
  return roles.includes('owner');
}

/** Administrative Praxisberechtigung (PROJECT_PRINCIPLES.md 4.1). */
export function isOwner(roles: readonly RoleKey[]): boolean {
  return roles.includes('owner');
}

export function isStaff(roles: readonly RoleKey[]): boolean {
  return roles.some((role) => role !== 'patient');
}
