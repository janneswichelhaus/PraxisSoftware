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
      'Die zusammengestellten und zugewiesenen Übungspläne mit Übungen, Dosierung und Laufzeit.',
  },
  platform_messages: {
    label: 'Nachrichten über die Plattform',
    beschreibung:
      'Fragen der Person und die Antworten der Praxis, mit Thema, Zeitpunkt, wer geschrieben hat und ob die Nachricht der Akte zugeordnet ist.',
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

/** Beschriftung eines Abschnitts; unbekannte Schlüssel bleiben sichtbar. */
export function kategorieLabel(key: string): string {
  return AUSKUNFT_KATEGORIEN[key]?.label ?? key;
}
