/**
 * Die Texte der Einwilligungen auf der Plattform (POR-016, POR-017).
 *
 * Eine Einwilligung ist nur wirksam, wenn die Person weiß, wozu sie Ja sagt
 * (Art. 4 Nr. 11, Art. 7 DSGVO): Jeder Zweck hat hier seinen Titel, seinen
 * Text und, wo der Widerruf etwas auslöst, einen Satz dazu. Die Sätze sind
 * kurz und ohne Fachwort (DSN-001 Abschnitt 7 Punkt 4, `IDEA-QSN-006`).
 *
 * **Fassung** (ANN-262): Mit jeder Zeile, die die Person erteilt oder
 * widerruft, speichert der Server die Fassung, die sie gesehen hat. Ändert
 * sich ein Text, steigt `EINWILLIGUNGSFASSUNG` - und
 * `app.platform_consent_wording_version()` in der Migration mit ihr;
 * `einwilligungen.test.ts` prüft, dass beide gleich sind. Eine Seite mit
 * altem Text wird dann abgewiesen, statt eine Einwilligung zu einem Text zu
 * speichern, den es nicht mehr gibt.
 *
 * Geprüft wird der Wortlaut mit der Datenschutzberatung (B2) vor dem
 * Scharfschalten; bis dahin ist er ein Entwurf.
 */
export const EINWILLIGUNGSFASSUNG = '2026-10';

export const PLATTFORM_ZWECKE = {
  treatment: ['email_contact', 'prescriber_report', 'patient_photos'],
  training: ['training_health_data'],
} as const;

export type Plattformzweck =
  (typeof PLATTFORM_ZWECKE.treatment)[number] | (typeof PLATTFORM_ZWECKE.training)[number];

export interface Einwilligungstext {
  titel: string;
  /** Was die Person erlaubt, in zwei bis vier kurzen Sätzen. */
  text: string;
  /** Was ein Widerruf auslöst, wenn es mehr ist als „ab jetzt nicht mehr". */
  widerruf?: string;
}

export const EINWILLIGUNGSTEXTE: Record<Plattformzweck, Einwilligungstext> = {
  email_contact: {
    titel: 'Nachrichten per E-Mail',
    text:
      'Die Praxis darf Ihnen Termine und andere organisatorische Nachrichten per E-Mail schicken. ' +
      'Eine normale E-Mail ist nicht verschlüsselt. Andere könnten sie unterwegs lesen.',
  },
  prescriber_report: {
    titel: 'Bericht an Ihre Ärztin oder Ihren Arzt',
    text:
      'Ihre Therapeut:in darf der Ärztin oder dem Arzt, die oder der Ihre Behandlung verordnet hat, ' +
      'berichten, wie die Behandlung verläuft. Dafür entbinden Sie die Praxis insoweit von der ' +
      'Schweigepflicht.',
  },
  patient_photos: {
    titel: 'Fotos während der Behandlung',
    text:
      'Das Praxisteam darf während der Behandlung Fotos machen, zum Beispiel von einer Narbe oder ' +
      'einer Schwellung. Die Fotos dienen dem Vergleich im Verlauf. Sie werden nicht ' +
      'weitergegeben und spätestens nach zwölf Monaten gelöscht.',
    widerruf: 'Die Praxis löscht dann sofort alle Fotos, die sie von Ihnen hat.',
  },
  training_health_data: {
    titel: 'Angaben zur Gesundheit im Training',
    text:
      'Ihre Trainer:in darf Angaben zu Ihrer Gesundheit festhalten, die für das Training wichtig ' +
      'sind, zum Beispiel Beschwerden, Einschränkungen oder Ihre Werte aus dem Eingangstest. ' +
      'Ohne diese Angaben kann das Training nicht auf Sie abgestimmt werden.',
    widerruf:
      'Ihre Trainer:in hält dann keine neuen Angaben zur Gesundheit mehr fest. Was mit den ' +
      'bisherigen geschieht, bespricht die Praxis mit Ihnen.',
  },
};

/** Der allgemeine Satz unter jeder Einwilligung (Art. 7 Abs. 3 DSGVO). */
export const FREIWILLIG =
  'Ihre Einwilligung ist freiwillig. Sie können sie jederzeit hier widerrufen. Der Widerruf ' +
  'gilt ab dann; was vorher geschah, bleibt rechtmäßig.';

/** Was die Behandlung bzw. das Training ohne Einwilligung bedeutet. */
export const OHNE_NACHTEIL = {
  treatment: 'Ihre Behandlung hängt nicht davon ab.',
  training: 'Ihr Vertrag hängt nicht davon ab.',
} as const;
