import type { StammdatenFeld } from './api';

/**
 * Feste Kennung je Feld (UX-012).
 *
 * Die Fehlerzusammenfassung über dem Formular springt auf das Feld, in dem der
 * Fehler steht; dafür muss die Kennung außerhalb der Komponente bekannt sein.
 */
export function stammdatenFeldId(feld: StammdatenFeld): string {
  return `stammdaten-${feld}`;
}

/**
 * Beschriftung je Feld, in der Reihenfolge des Formulars.
 *
 * Die Zusammenfassung arbeitet die Liste von oben nach unten ab: Wer sie so
 * abarbeitet, geht durch das Formular und nicht kreuz und quer. Die
 * Beschriftungen sind dieselben wie an den Feldern, ohne den Stern - er
 * bedeutet „erforderlich" und ist in einer Fehlerliste kein Teil des Namens.
 */
export const STAMMDATEN_BESCHRIFTUNG: Record<StammdatenFeld, string> = {
  given_name: 'Vorname',
  family_name: 'Nachname',
  date_of_birth: 'Geburtsdatum',
  email: 'E-Mail',
  phone: 'Telefon (privat)',
  phone_mobile: 'Mobil',
  phone_work: 'Telefon (geschäftlich)',
  fax: 'Telefax',
  institution: 'Einrichtung',
  street: 'Straße',
  house_number: 'Hausnummer',
  postal_code: 'PLZ',
  city: 'Ort',
  primary_therapist_staff_member_id: 'Feste Therapeut:in',
  home_visit_access_note: 'Zugang zur Wohnung',
  special_note: 'Besonderheit',
  remark: 'Bemerkung',
};

export const STAMMDATEN_REIHENFOLGE = Object.keys(STAMMDATEN_BESCHRIFTUNG) as StammdatenFeld[];
