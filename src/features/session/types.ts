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
 * Rollen, die fachlich ueber eine Behandlung entscheiden: Verordnungen
 * schreiben, klinische Dateien ablegen, die Versorgung abschliessen.
 *
 * owner, therapist, team_lead - ohne office. Seit E15 liest office klinische
 * Inhalte wie diese Rollen, schreibt aber keine (PROJECT_PRINCIPLES.md 4.3,
 * ADR-004 Fassung 2 Punkt 3). Lesen und Schreiben stehen deshalb in
 * getrennten Listen: Wer das Leserecht aendert, aendert kein Schreibrecht mit.
 */
const treatingRoles: RoleKey[] = ['owner', 'therapist', 'team_lead'];

/**
 * Rollen mit Lesezugriff auf klinische Behandlungsdokumentation.
 *
 * Alle vier Praxisrollen: office liest seit E15 im selben Umfang wie
 * Therapeut:innen (ROL-001), owner schon immer (4.1). Jeder gelesene Eintrag
 * wird serverseitig protokolliert (ADR-010). Steuert ausschliesslich die
 * Darstellung - verbindlich ist app.can_read_treatment_note() in der
 * Datenbank.
 */
export function canReadTreatmentNote(roles: readonly RoleKey[]): boolean {
  return roles.some((role) => directoryRoles.includes(role));
}

/**
 * Rollen mit Zugriff auf die organisatorische Sicht einer Verordnung.
 *
 * Alle vier Praxisrollen: office plant Termine daraus und fordert
 * Folgeverordnungen an (PROJECT_PRINCIPLES.md 4.3). Steuert ausschliesslich
 * die Darstellung - verbindlich ist app.can_read_treatment_bases() in der
 * Datenbank, und gelesen wird ausschliesslich ueber
 * list_patient_treatment_bases.
 */
export function canReadTreatmentBases(roles: readonly RoleKey[]): boolean {
  return roles.some((role) => directoryRoles.includes(role));
}

/**
 * Rollen mit Zugriff auf die klinischen Felder einer Verordnung.
 *
 * Deckungsgleich mit canReadTreatmentNote: alle vier Praxisrollen, seit E15
 * auch office (ROL-002, ADR-004 Fassung 2 Punkt 3). Jede gelesene Verordnung
 * wird serverseitig protokolliert. Verbindlich ist
 * app.can_read_treatment_basis_clinical().
 */
export function canReadTreatmentBasisClinical(roles: readonly RoleKey[]): boolean {
  return roles.some((role) => directoryRoles.includes(role));
}

/**
 * Rollen, die Verordnungen anlegen, aendern und loeschen duerfen.
 *
 * Ohne office (ANN-011): wer eine Verordnung erfasst, tippt die Diagnose mit
 * ab. E15 oeffnet das Lesen, nicht das Schreiben. Verbindlich ist
 * app.can_write_treatment_bases().
 */
export function canWriteTreatmentBases(roles: readonly RoleKey[]): boolean {
  return roles.some((role) => treatingRoles.includes(role));
}

/**
 * Rollen mit Zugriff auf die Dateien einer Akte (DAT-001, ADR-017 Punkt 12).
 *
 * Alle vier Praxisrollen. Diese Funktion steuert nur, ob der Bereich in der
 * Akte ueberhaupt auftaucht; verbindlich sind app.can_read_patient_files() und
 * app.can_see_patient_file_type().
 */
export function canReadPatientFiles(roles: readonly RoleKey[]): boolean {
  return roles.some((role) => directoryRoles.includes(role));
}

/**
 * Rollen, die klinische Dateien sehen duerfen (ADR-017 Punkt 12).
 *
 * Alle vier Praxisrollen seit E15, der Verordnungsscan eingeschlossen
 * (ROL-002, ADR-004 Fassung 2 Punkt 3). Jeder ausgestellte Verweis wird
 * protokolliert. Verbindlich ist app.can_read_clinical_patient_files().
 */
export function canReadClinicalPatientFiles(roles: readonly RoleKey[]): boolean {
  return roles.some((role) => directoryRoles.includes(role));
}

/**
 * Rollen, die klinische Dateien hinzufuegen und loeschen duerfen.
 *
 * Ohne office: das Leserecht aus E15 oeffnet kein Schreibrecht (ADR-017
 * Punkt 13). Verbindlich ist app.can_write_clinical_patient_files().
 */
export function canWriteClinicalPatientFiles(roles: readonly RoleKey[]): boolean {
  return roles.some((role) => treatingRoles.includes(role));
}

/**
 * Rollen, die die Dokumentart einer Datei korrigieren duerfen.
 *
 * Ohne office (ADR-017 Punkt 13): die Art bestimmt, wer eine Datei hinzufuegen
 * und loeschen darf. Verbindlich ist app.can_correct_patient_file_type().
 */
export function canCorrectPatientFileType(roles: readonly RoleKey[]): boolean {
  return roles.some((role) => treatingRoles.includes(role));
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
  return roles.some((role) => treatingRoles.includes(role));
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

/**
 * Rollen, die den Leistungskatalog pflegen duerfen (ABR-001, ANN-071).
 *
 * Nur owner: Ein Preis ist eine Unternehmensentscheidung und steht in 4.1 bei
 * den Praxiseinstellungen; 4.3 gibt dem Office Rechnungen und Zahlungsstatus,
 * nicht die Preisbildung. Steuert ausschliesslich die Darstellung -
 * verbindlich ist app.can_manage_service_catalog().
 */
export function canManageServiceCatalog(roles: readonly RoleKey[]): boolean {
  return roles.includes('owner');
}

/**
 * Rollen, die Leistungen erfassen und wieder entfernen duerfen (ABR-002).
 *
 * owner und office: Die Erfassung ist der erste Schritt der Abrechnung
 * (PROJECT_PRINCIPLES.md 4.3). Verbindlich ist
 * app.can_record_billable_services().
 */
export function canRecordBillableServices(roles: readonly RoleKey[]): boolean {
  return roles.some((role) => role === 'owner' || role === 'office');
}

/**
 * Rollen, die die Praxis-Stammdaten fuer Rechnungen pflegen duerfen
 * (ABR-000, ANN-074).
 *
 * Nur owner: Anschrift, Bankverbindung und Steuernummer sind
 * Praxiseinstellungen (PROJECT_PRINCIPLES.md 4.1). Lesen darf das Office sie,
 * pflegen nicht. Steuert ausschliesslich die Darstellung - verbindlich ist
 * app.can_manage_billing_profile().
 */
export function canManageBillingProfile(roles: readonly RoleKey[]): boolean {
  return roles.includes('owner');
}

/** Administrative Praxisberechtigung (PROJECT_PRINCIPLES.md 4.1). */
export function isOwner(roles: readonly RoleKey[]): boolean {
  return roles.includes('owner');
}

export function isStaff(roles: readonly RoleKey[]): boolean {
  return roles.some((role) => role !== 'patient');
}
