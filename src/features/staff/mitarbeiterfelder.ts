import type { StaffFeld } from './api';

/**
 * Feste Kennung je Feld (UX-012) - die Fehlerzusammenfassung springt darauf.
 */
export function staffFeldId(feld: StaffFeld): string {
  return `mitarbeit-${feld}`;
}

/** Beschriftung je Feld, in der Reihenfolge des Formulars. */
export const STAFF_BESCHRIFTUNG: Record<StaffFeld, string> = {
  given_name: 'Vorname',
  family_name: 'Nachname',
  work_email: 'Dienstliche E-Mail',
  work_phone: 'Diensttelefon',
  primary_location_id: 'Hauptstandort',
  date_of_birth: 'Geburtsdatum',
  private_email: 'Private E-Mail',
  private_phone: 'Privattelefon',
  street: 'Straße und Hausnummer',
  postal_code: 'PLZ',
  city: 'Ort',
};

const DIENSTLICH: StaffFeld[] = [
  'given_name',
  'family_name',
  'work_email',
  'work_phone',
  'primary_location_id',
];

const PRIVAT: StaffFeld[] = [
  'date_of_birth',
  'private_email',
  'private_phone',
  'street',
  'postal_code',
  'city',
];

/**
 * Welche Felder die Zusammenfassung nennen darf - abhängig vom Zugriff.
 *
 * Ohne Privatzugriff steht der Abschnitt gar nicht auf der Seite (ANN-024).
 * Ein Eintrag dorthin führte ins Leere: Der Sprung fände kein Feld, und die
 * Meldung nennte eine Angabe, die diese Rolle weder sieht noch ändern darf.
 */
export function staffReihenfolge(privat: boolean): StaffFeld[] {
  return privat ? [...DIENSTLICH, ...PRIVAT] : DIENSTLICH;
}
