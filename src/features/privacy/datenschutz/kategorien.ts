/**
 * Beschriftungen der Auskunft nach Art. 15 DSGVO (OPS-006).
 *
 * Was die Kopie enthält, entscheidet `public.export_patient_record`; sie
 * liefert einen Schlüssel je Tabelle. Diese Datei übersetzt die Schlüssel in
 * die Sprache, in der eine Patientin liest, und ordnet sie — sie entscheidet
 * nichts. Dieselbe Arbeitsteilung wie beim Aufbewahrungsplan
 * (`src/features/retention/klassen.ts`).
 *
 * `supabase/tests/betroffenenrechte.test.ts` hält beide Listen deckungsgleich:
 * Eine Tabelle in der Kopie ohne Beschriftung lässt den Datenbanktest
 * scheitern, eine Beschriftung ohne Tabelle ebenso.
 */

interface KategorieTexte {
  /** Überschrift des Abschnitts. */
  label: string;
  /** Ein Satz: worum es geht. */
  beschreibung: string;
}

/**
 * Die Abschnitte in der Reihenfolge, in der eine Auskunft gelesen wird: wer
 * die Person ist, was vereinbart war, was behandelt wurde, was abgerechnet
 * wurde.
 */
export const AUSKUNFT_KATEGORIEN: Record<string, KategorieTexte> = {
  persons: {
    label: 'Name',
    beschreibung: 'Vor- und Nachname, wie sie bei uns geführt werden.',
  },
  patients: {
    label: 'Behandlungsverhältnis',
    beschreibung: 'Beginn, Status und gegebenenfalls Abschluss der Versorgung.',
  },
  patient_contact_details: {
    label: 'Kontakt- und Stammdaten',
    beschreibung: 'Geburtsdatum, Anschrift mit Kartenposition und Erreichbarkeit.',
  },
  patient_care_details: {
    label: 'Angaben zur Versorgung',
    beschreibung: 'Behandelnde Person, Zugangshinweise für Hausbesuche und Vermerke.',
  },
  appointments: {
    label: 'Termine',
    beschreibung: 'Alle vereinbarten, durchgeführten und abgesagten Termine.',
  },
  appointment_notifications: {
    label: 'Terminbenachrichtigungen',
    beschreibung: 'Wann über einen Termin informiert wurde und auf welchem Weg.',
  },
  treatment_bases: {
    label: 'Behandlungsgrundlagen',
    beschreibung: 'Verordnungen und Selbstzahlervereinbarungen samt Diagnose und Therapieziel.',
  },
  treatment_base_items: {
    label: 'Positionen der Behandlungsgrundlagen',
    beschreibung: 'Die verordneten Heilmittel mit Menge und Verbrauch.',
  },
  treatment_basis_versions: {
    label: 'Frühere Stände der Behandlungsgrundlagen',
    beschreibung: 'Was vor jeder Änderung auf einer Grundlage stand, mit Zeitpunkt und Person.',
  },
  treatment_notes: {
    label: 'Behandlungsdokumentation',
    beschreibung: 'Die Dokumentation je Termin in ihrer geltenden Fassung.',
  },
  // „Versionen" wie in der Dokumentation selbst (WRT-17): Dort heißt es
  // „Version 1", „Versionen" - die Auskunft sprach von „Fassungen".
  treatment_note_versions: {
    label: 'Versionen der Dokumentation',
    beschreibung:
      'Frühere Versionen und Korrekturgründe; die Dokumentation wird nie überschrieben.',
  },
  patient_questionnaire_responses: {
    label: 'Fragebögen',
    beschreibung:
      'Erhobene Fragebögen wie der Anamnesebogen mit allen Antworten; eine Korrektur steht neben der ursprünglichen Fassung.',
  },
  patient_course_events: {
    label: 'Ereignisse im Verlauf',
    beschreibung:
      'Von der Praxis vermerkte Ereignisse wie eine Operation oder eine Erkrankung, mit Tag und kurzer Notiz.',
  },
  treatment_draft_findings: {
    label: 'Gesicherte Befundangaben',
    beschreibung:
      'Angaben aus den Untersuchungsbausteinen, die noch nicht in die Dokumentation übernommen sind; sie fallen beim Festschreiben weg.',
  },
  therapy_reports: {
    label: 'Therapieberichte',
    beschreibung:
      'Berichte an die verordnende Ärzt:in: Entwürfe und abgeschlossene Berichte, diese so, wie sie abgeschlossen wurden.',
  },
  waitlist_entries: {
    label: 'Warteliste',
    beschreibung:
      'Einträge auf der Warteliste mit Wunschzeiten, Dauer, Grund und kurzer Notiz; auch eingeplante und zurückgezogene, bis ihre Frist abläuft.',
  },
  tasks: {
    label: 'Aufgaben',
    beschreibung:
      'Aufgaben und Wiedervorlagen der Praxis mit Bezug auf die Person: was zu tun ist, bis wann, wer es übernimmt, und ob es erledigt ist.',
  },
  appointment_call_states: {
    label: 'Anrufliste',
    beschreibung:
      'Ob die Praxis die Person vor einem Termin telefonisch nicht erreicht oder eine Nachricht hinterlassen hat, mit Zahl der Versuche; zwei Wochen nach dem Termin gelöscht.',
  },
  patient_files: {
    label: 'Dateien',
    beschreibung: 'Hochgeladene Dokumente mit Name, Art und Prüfsumme – ohne den Inhalt selbst.',
  },
  patient_photos: {
    label: 'Fotos',
    beschreibung:
      'Jedes vorhandene Foto, auch gesperrte. Die Fotos selbst gibt die Praxis als Dateien dazu heraus.',
  },
  patient_privacy_records: {
    label: 'Datenschutz und Einwilligungen',
    beschreibung:
      'Wann Datenschutzinformation und Behandlungsvertrag vorlagen und welche Einwilligungen erteilt oder widerrufen wurden.',
  },
  patient_merge_records: {
    label: 'Zusammengeführte Akten',
    beschreibung:
      'Wann eine doppelt angelegte Akte mit dieser zusammengeführt wurde und was dabei mitgezogen ist.',
  },
  legal_holds: {
    label: 'Löschsperren',
    beschreibung: 'Vorgänge, für die die Akte von der automatischen Löschung ausgenommen ist.',
  },
  billable_services: {
    label: 'Erfasste Leistungen',
    beschreibung: 'Die abrechenbaren Leistungen je Termin.',
  },
  session_fees: {
    label: 'Terminhonorare',
    beschreibung: 'Das je Behandlungstermin festgeschriebene Honorar und woher es kam.',
  },
  fee_agreements: {
    label: 'Honorarvereinbarungen',
    beschreibung:
      'Das mit der Person vereinbarte Honorar je Behandlungstermin und ab wann es gilt.',
  },
  aftercare_subscriptions: {
    label: 'Nachsorge-Abo',
    beschreibung: 'Beginn, Ende und Kündigung des Nachsorge-Abos nach der Behandlung.',
  },
  training_offers: {
    label: 'Trainingsangebote',
    beschreibung:
      'Welches Trainingspaket die Praxis nach der Behandlung angeboten hat, mit den Angaben, die sie mitgeben wollte, und ob es angenommen wurde.',
  },
  exercise_plans: {
    label: 'Übungspläne',
    beschreibung:
      'Die zusammengestellten und zugewiesenen Übungspläne mit Übungen, Dosierung und Laufzeit, dazu die durchgeführten Einheiten mit den Angaben der Person.',
  },
  checkin_schedules: {
    label: 'Check-in: Takt und Fragen',
    beschreibung: 'Wie oft und mit welchen Fragen die Praxis um einen Check-in bittet.',
  },
  checkins: {
    label: 'Check-ins',
    beschreibung: 'Die beantworteten Check-ins mit Tag, wer geantwortet hat, und den Angaben.',
  },
  habits: {
    label: 'Gewohnheiten',
    beschreibung:
      'Die mit der Praxis vereinbarten Gewohnheiten mit Auslöser und Ort, ob pausiert oder beendet, und die Tage, an denen die Person sie vermerkt hat.',
  },
  nutrition_profiles: {
    label: 'Ernährungsberatung',
    beschreibung:
      'Ernährungsprofil mit Körperdaten, Ziel, Zielwerten samt Rechenweg, Notizen der Beratung, Einwilligung mit Verlauf und Gewichtsverlauf.',
  },
  platform_messages: {
    label: 'Nachrichten über die Plattform',
    beschreibung:
      'Fragen der Person und die Antworten der Praxis, mit Thema, Zeitpunkt, wer geschrieben hat und ob die Nachricht der Akte zugeordnet ist.',
  },
  platform_appointment_requests: {
    label: 'Terminwünsche über die Plattform',
    beschreibung:
      'Gewünschte Tage und Tageszeiten, Notiz, wer gewünscht hat, Zustand und die Antwort der Praxis.',
  },
  platform_accesses: {
    label: 'Zugänge zur Plattform',
    beschreibung:
      'Der eigene Zugang und die Zugänge einer Vertretung oder Begleitung: Name, Grundlage und Umfang, Einwilligung, Zustand und wann der Zugang eingerichtet, gesperrt oder beendet wurde.',
  },
  invoice_recipients: {
    label: 'Rechnungsempfänger',
    beschreibung: 'An wen Rechnungen gehen, wenn das nicht die Patient:in selbst ist.',
  },
  invoices: {
    label: 'Rechnungen',
    beschreibung: 'Entwürfe und ausgestellte Rechnungen samt dem festgehaltenen Dokument.',
  },
  invoice_items: {
    label: 'Rechnungspositionen',
    beschreibung: 'Welche Leistung auf welcher Rechnung steht.',
  },
  invoice_cancellations: {
    label: 'Stornierungen',
    beschreibung: 'Stornodokumente zu ausgestellten Rechnungen.',
  },
  invoice_payment_reminders: {
    label: 'Zahlungserinnerungen',
    beschreibung: 'Versandte Erinnerungen mit dem jeweils offenen Betrag.',
  },
  payments: {
    label: 'Zahlungen',
    beschreibung: 'Gebuchte Zahlungen und Rückzahlungen.',
  },
  access_log: {
    label: 'Zugriffe auf die Akte',
    beschreibung:
      'Wann auf die Akte zugegriffen wurde und wozu – ohne Namen der Beschäftigten (Art. 15 Abs. 4 DSGVO).',
  },
};

/**
 * Die Abschnitte der Auskunft zu einem Trainingsverhältnis (BEF-182,
 * `public.export_training_record`): eigenes Rechtsverhältnis, eigene Kopie
 * (ADR-021). Was beide Kopien teilen, heißt in beiden gleich.
 * `supabase/tests/auskunft-training.test.ts` hält diese Liste deckungsgleich
 * mit der Kopie.
 */
export const TRAINING_KATEGORIEN: Record<string, KategorieTexte> = {
  persons: AUSKUNFT_KATEGORIEN['persons']!,
  training_relationships: {
    label: 'Trainingsverhältnis',
    beschreibung: 'Zustand, Beginn und Ende des Trainingsvertrags.',
  },
  training_contact_details: {
    label: 'Kontaktdaten',
    beschreibung: 'Geburtsdatum, Anschrift, Telefon und E-Mail für das Training.',
  },
  training_profiles: {
    label: 'Voraussetzungen',
    beschreibung: 'Ziele, Ausstattung, Zeit, Orte, Grenzen und Vorgeschichte für das Training.',
  },
  training_assessments: {
    label: 'Tests und Messungen',
    beschreibung: 'Durchgeführte Tests mit Bedingungen und nächstem Termin.',
  },
  training_bases: {
    label: 'Trainingsgrundlagen',
    beschreibung: 'Vereinbarte Grundlage mit Beginn und Umfang.',
  },
  training_consent_records: {
    label: 'Einwilligungen',
    beschreibung: 'Erteilte und widerrufene Einwilligungen mit Datum und Weg.',
  },
  training_contracts: {
    label: 'Trainingsverträge',
    beschreibung: 'Angebot, Abschluss, Preis, Laufzeit und Widerruf.',
  },
  training_packages: {
    label: 'Trainingspakete',
    beschreibung: 'Gebuchte Pakete mit Laufzeit.',
  },
  training_course_events: {
    label: 'Verlauf',
    beschreibung: 'Vermerke zum Verlauf des Trainings.',
  },
  training_protocols: {
    label: 'Trainingsprotokolle',
    beschreibung: 'Was in den Einheiten trainiert wurde.',
  },
  training_takeovers: {
    label: 'Übernahmen aus der Behandlung',
    beschreibung: 'Was aus einer Behandlung für das Training freigegeben wurde.',
  },
  appointments: AUSKUNFT_KATEGORIEN['appointments']!,
  appointment_notifications: AUSKUNFT_KATEGORIEN['appointment_notifications']!,
  exercise_plans: AUSKUNFT_KATEGORIEN['exercise_plans']!,
  checkin_schedules: AUSKUNFT_KATEGORIEN['checkin_schedules']!,
  checkins: AUSKUNFT_KATEGORIEN['checkins']!,
  habits: AUSKUNFT_KATEGORIEN['habits']!,
  nutrition_profiles: AUSKUNFT_KATEGORIEN['nutrition_profiles']!,
  platform_messages: AUSKUNFT_KATEGORIEN['platform_messages']!,
  platform_appointment_requests: AUSKUNFT_KATEGORIEN['platform_appointment_requests']!,
  platform_accesses: AUSKUNFT_KATEGORIEN['platform_accesses']!,
  billable_services: AUSKUNFT_KATEGORIEN['billable_services']!,
  session_fees: AUSKUNFT_KATEGORIEN['session_fees']!,
  invoices: AUSKUNFT_KATEGORIEN['invoices']!,
  invoice_items: AUSKUNFT_KATEGORIEN['invoice_items']!,
  invoice_cancellations: AUSKUNFT_KATEGORIEN['invoice_cancellations']!,
  invoice_payment_reminders: AUSKUNFT_KATEGORIEN['invoice_payment_reminders']!,
  payments: AUSKUNFT_KATEGORIEN['payments']!,
  access_log: {
    label: 'Zugriffe auf das Trainingsverhältnis',
    beschreibung:
      'Wann auf die Daten zugegriffen wurde und wozu – ohne Namen der Beschäftigten (Art. 15 Abs. 4 DSGVO).',
  },
};

/** Beschriftung eines Abschnitts; unbekannte Schlüssel bleiben sichtbar. */
export function kategorieLabel(
  key: string,
  kategorien: Record<string, KategorieTexte> = AUSKUNFT_KATEGORIEN,
): string {
  return kategorien[key]?.label ?? key;
}
