/**
 * Katalog der auditpflichtigen Aktionen (ADR-010).
 *
 * Diese Liste MUSS deckungsgleich mit der Check-Constraint auf
 * public.audit_log.action sein. Ein Datenbanktest prüft das gegeneinander -
 * andernfalls würde ein neues Ereignis in der Oberfläche fehlen oder ein
 * Filterwert ins Leere laufen.
 */
export const AUDIT_ACTIONS = [
  // Akte geöffnet: höchstens einmal je Person, Akte und Kalendertag; ebenso
  // das Trainingsverhältnis und das Lesen über eine Vertretung (ADR-023).
  'patient_record.viewed',
  'training_relationship.viewed',
  'platform_representation.read',
  // Herunterladen einer Datei; das Anzeigen steht nicht im Protokoll.
  'patient_file.downloaded',
  // Exporte: Auskunft nach Art. 15 DSGVO, Therapiebericht, Foto an die Person.
  'patient_record.exported',
  'therapy_report.exported',
  'patient_file.handed_out',
  // Portalzugang (ADR-023).
  'platform_access.invited',
  'platform_access.activated',
  'platform_access.locked',
  'platform_access.unlocked',
  'platform_access.revoked',
  // Konten und Rechte, Sicherheitsereignisse des eigenen Kontos.
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
  // Jede Abweisung; Operation und Zähler stehen im Kontext.
  'access.denied',
  // Der Löschlauf, eine Zusammenfassung je Lauf und Organisation.
  'retention.applied',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const auditActionLabels: Record<AuditAction, string> = {
  'patient_record.viewed': 'Patientenakte geöffnet',
  'training_relationship.viewed': 'Trainingskund:in geöffnet',
  'platform_representation.read': 'Plattform über eine Vertretung geöffnet',
  'patient_file.downloaded': 'Datei heruntergeladen',
  'patient_record.exported': 'Auskunft aus der Akte erteilt',
  'therapy_report.exported': 'Therapiebericht gedruckt',
  'patient_file.handed_out': 'Foto an die Person herausgegeben',
  'platform_access.invited': 'Zur Plattform eingeladen',
  'platform_access.activated': 'Plattformzugang eingerichtet',
  'platform_access.locked': 'Plattformzugang gesperrt',
  'platform_access.unlocked': 'Plattformzugang entsperrt',
  'platform_access.revoked': 'Plattformzugang entzogen',
  'staff_account.invited': 'Zugang eingeladen',
  'staff_account.invitation_revoked': 'Einladung zurückgenommen',
  'staff_account.invitation_accepted': 'Einladung angenommen',
  'staff_account.roles_changed': 'Rollen geändert',
  'staff_account.locked': 'Zugang gesperrt',
  'staff_account.unlocked': 'Zugang entsperrt',
  'staff_account.password_reset_requested': 'Kennwort zurücksetzen angestoßen',
  'account.password_changed': 'Eigenes Kennwort geändert',
  'account.sessions_ended': 'Alle eigenen Sitzungen beendet',
  'account.mfa_enrolled': 'Zweiter Faktor eingerichtet',
  'account.mfa_removed': 'Zweiter Faktor entfernt',
  'organization.bootstrapped': 'Praxis eingerichtet',
  'access.denied': 'Zugriff abgewiesen',
  'retention.applied': 'Löschlauf ausgeführt',
};

/**
 * Beschriftung der abgewiesenen Operation (`access.denied`, LOG-EPIC-001).
 *
 * Eine Abweisung nennt in `context.operation` den Namen, unter dem der
 * Lese- oder Schreibpfad abgewiesen wurde. Diese Namen sind keine Aktionen
 * des Auditlogs mehr; `supabase/tests/audit-protokoll-lesen.test.ts` prüft,
 * dass jeder Aufruf von `app.record_denied_*` hier eine Beschriftung hat.
 */
export const auditOperationLabels: Record<string, string> = {
  // ANG-001: Nachsorge-Abo der Akte und fällige Abo-Monate (owner, office).
  'aftercare.read': 'Nachsorge-Abo gelesen',
  'appointment.created': 'Termin angelegt',
  'appointment_brief.viewed': 'Kurzblick am Termin geöffnet',
  'appointments.read': 'Termine gelesen',
  'audit_log.read': 'Protokoll gelesen',
  'billable_services.read': 'Leistungen gelesen',
  'deletion_runs.read': 'Löschläufe gelesen',
  // UEB-EPIC-002: Übungspläne einer Akte oder Trainingskund:in (ANN-298).
  'exercise_plans.read': 'Übungspläne gelesen',
  // KOM-002: Abweisung der Liste der Rückfragen (keine neue Aktion, ADR-010).
  'platform_messages.read': 'Rückfragen gelesen',
  'invoicing.read': 'Abrechnung gelesen',
  'legal_hold.placed': 'Löschsperre gesetzt',
  'legal_hold.released': 'Löschsperre aufgehoben',
  'legal_holds.read': 'Löschsperren gelesen',
  'patient.merged': 'Dublette in die Akte übernommen',
  'patient_course_event.viewed': 'Ereignisse im Verlauf gelesen',
  'patient_directory.read': 'Patientenverzeichnis durchsucht',
  'patient_files.read': 'Dateien der Akte gelesen',
  'patient_record.viewed': 'Patientenakte geöffnet',
  'platform_access.companion_declined':
    'Begleitung nicht eingerichtet (Zweifel an der Einwilligung)',
  'platform_access.invitation_sent': 'Einladung zur Plattform per Mail versandt',
  'platform_access.invited': 'Zur Plattform eingeladen',
  'platform_access.revoked': 'Plattformzugang entzogen',
  'platform_accesses.read': 'Plattformzugang angesehen',
  'questionnaire_response.viewed': 'Fragebogen gelesen',
  'staff_account.invitation_revoked': 'Einladung zurückgenommen',
  'staff_account.invited': 'Zugang eingeladen',
  'staff_account.password_reset_requested': 'Kennwort zurücksetzen angestoßen',
  'staff_account.roles_changed': 'Rollen geändert',
  'staff_member.updated': 'Mitarbeiterstammdaten geändert',
  'statistics.read': 'Statistiken gelesen',
  'storage_deletion.claimed': 'Löschung in der Ablage freigegeben',
  'storage_deletion.ordered': 'Verwaiste Objekte zum Löschen vorgemerkt',
  'storage_deletion.read': 'Löschaufträge der Ablage gelesen',
  'storage_deletion.receipted': 'Löschung in der Ablage quittiert',
  'tasks.read': 'Aufgaben gelesen',
  'text_snippets.read': 'Textbausteine gelesen',
  'therapy_report.viewed': 'Therapiebericht gelesen',
  'training_basis.concluded': 'Vereinbarung im Training abgeschlossen',
  'training_basis.created': 'Vereinbarung im Training angelegt',
  'training_basis.reopened': 'Vereinbarung im Training wieder geöffnet',
  // ANG-006: Trainingspakete eines Verhältnisses und der Preisliste (owner, office).
  'training_packages.read': 'Trainingspakete gelesen',
  'training_protocol.finalized': 'Trainingsprotokoll abgeschlossen',
  'training_protocol.updated': 'Trainingsprotokoll geändert',
  'training_protocol.viewed': 'Trainingsprotokoll gelesen',
  'training_relationship.created': 'Trainingskund:in angelegt',
  'training_relationship.ended': 'Trainingsvertrag beendet',
  'training_relationship.reopened': 'Trainingsvertrag wieder aufgenommen',
  'training_relationship.updated': 'Trainingskund:in geändert',
  'training_relationship.viewed': 'Trainingskund:in geöffnet',
  'training_relationships.read': 'Trainingskund:innen gelesen',
  'treatment_bases.read': 'Behandlungsgrundlagen gelesen',
  'treatment_basis.viewed': 'Behandlungsgrundlage gelesen',
  'treatment_draft_findings.viewed': 'Gesicherte Befundangaben geladen',
  'treatment_evidence.read': 'Behandlungsnachweis gelesen',
  'treatment_note.history_viewed': 'Änderungsverlauf gelesen',
  'treatment_note.viewed': 'Behandlungsdokumentation gelesen',
  'waitlist.read': 'Warteliste gelesen',
};

/**
 * Beschriftung der Gegenstände einer Auditzeile.
 *
 * Deckungsgleich mit der Check-Constraint `audit_log_subject_type_check`;
 * `actions.test.ts` prüft das gegen die jüngste Migration. Bis UXR-011 fehlten
 * `text_snippet` und `user_account`, und die Liste zeigte den Schlüssel der
 * Datenbank - ausgerechnet bei den Kontoereignissen (ORG-20). Nur
 * Beschriftung: der Katalog selbst bleibt, wie er ist.
 */
export const auditSubjectLabels: Record<string, string> = {
  patient: 'Patient:in',
  training_relationship: 'Trainingsverhältnis',
  patient_file: 'Datei der Akte',
  therapy_report: 'Therapiebericht',
  platform_access: 'Plattformzugang',
  staff_member: 'Mitarbeiter:in',
  user_account: 'Zugang',
  organization: 'Organisation',
};

export const auditOutcomeLabels: Record<string, string> = {
  success: 'Erfolgreich',
  denied: 'Abgewiesen',
};
