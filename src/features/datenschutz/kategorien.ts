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
    beschreibung: 'Geburtsdatum, Anschrift und Erreichbarkeit.',
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
  treatment_note_versions: {
    label: 'Fassungen der Dokumentation',
    beschreibung:
      'Frühere Fassungen und Korrekturgründe; die Dokumentation wird nie überschrieben.',
  },
  patient_files: {
    label: 'Dateien',
    beschreibung: 'Hochgeladene Dokumente mit Name, Art und Prüfsumme — ohne den Inhalt selbst.',
  },
  legal_holds: {
    label: 'Löschsperren',
    beschreibung: 'Vorgänge, für die die Akte von der automatischen Löschung ausgenommen ist.',
  },
  billable_services: {
    label: 'Erfasste Leistungen',
    beschreibung: 'Die abrechenbaren Leistungen je Termin.',
  },
  invoice_recipients: {
    label: 'Rechnungsempfänger',
    beschreibung: 'An wen Rechnungen gehen, wenn das nicht die Patientin selbst ist.',
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
};

/** Beschriftung eines Abschnitts; unbekannte Schlüssel bleiben sichtbar. */
export function kategorieLabel(key: string): string {
  return AUSKUNFT_KATEGORIEN[key]?.label ?? key;
}
