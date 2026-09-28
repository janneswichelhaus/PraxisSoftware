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
 *
 * „Zugangshinweis" heißt überall gleich - im Formular, in dieser Liste, in den
 * Stammdaten und im Kopf der Akte (PAT-07, WRT-17). Vorher waren es vier Namen
 * für ein Feld, und die Fehlerliste nannte eines, das es im Formular nicht gab.
 */
export const STAMMDATEN_BESCHRIFTUNG: Record<StammdatenFeld, string> = {
  given_name: 'Vorname',
  family_name: 'Nachname',
  date_of_birth: 'Geburtsdatum',
  phone_mobile: 'Mobil',
  phone: 'Telefon (privat)',
  phone_work: 'Telefon (geschäftlich)',
  fax: 'Telefax',
  email: 'E-Mail',
  institution: 'Einrichtung',
  street: 'Straße',
  house_number: 'Hausnummer',
  postal_code: 'PLZ',
  city: 'Ort',
  primary_therapist_staff_member_id: 'Feste Therapeut:in',
  home_visit_access_note: 'Zugangshinweis',
  special_note: 'Besonderheit',
  remark: 'Bemerkung',
};

export const STAMMDATEN_REIHENFOLGE = Object.keys(STAMMDATEN_BESCHRIFTUNG) as StammdatenFeld[];
