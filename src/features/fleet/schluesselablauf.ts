import type { Bike, Fleet, FleetStaff } from './api';
import { standort } from './rad';

/**
 * Schlüssel übergeben (Überholung 6, G4) ohne Oberfläche: welche Räder und
 * Personen zur Wahl stehen, wo der Ablauf beginnt und welcher Vorgang am Ende
 * läuft.
 *
 * Drei Seiten: „Welches Rad?“ → „An wen?“ → Abschluss. Mit einem Rad aus der
 * Adresse (`?rad=`) entfällt die erste. Liegt der Schlüssel im Tresor, trägt
 * der Abschluss ihn ein (`take_fleet_key`); liegt er bei jemandem, geht er in
 * einem Vorgang von Hand zu Hand (`hand_over_fleet_key`, ANN-575). Ob das
 * gilt, entscheidet der Server; die Auswahl bietet nur nicht an, was er
 * abwiese (ADR-004).
 */

export type Seite = 'rad' | 'person' | 'abschluss';

/** Rad, Person, Abschluss - auch wenn das Rad aus der Adresse kommt. */
export const SCHRITTE = 3;

export function schrittnummer(seite: Seite): number {
  return seite === 'rad' ? 1 : seite === 'person' ? 2 : 3;
}

/**
 * Die Räder, deren Schlüssel man eintragen oder übergeben kann: im Tresor
 * oder bei jemandem. Ein gesperrtes Rad nicht - den Schlüssel gibt es erst
 * nach der Freigabe.
 */
export function raederZurWahl(flotte: Pick<Fleet, 'bikes'>): Bike[] {
  return flotte.bikes.filter((rad) => !rad.block);
}

/** Wo der Schlüssel liegt, aus Sicht der angemeldeten Person. */
export function schluesselOrt(rad: Bike, ich: string | null): string {
  if (!rad.key) return 'Schlüssel im Tresor';
  if (rad.key.holder_staff_id === ich) return 'Schlüssel bei Ihnen';
  return `Schlüssel bei ${rad.key.holder_name ?? 'jemandem'}`;
}

/** Eine Zeile der Radwahl: wo der Schlüssel liegt und wo das Rad steht. */
export function radZeile(rad: Bike, flotte: Pick<Fleet, 'depots' | 'my_staff_member_id'>): string {
  return `${schluesselOrt(rad, flotte.my_staff_member_id)} · ${standort(rad, flotte.depots)}`;
}

/** Eine Person der Auswahl: die eigene mit „(Sie)“. */
export function personName(person: FleetStaff, ich: string | null): string {
  return person.id === ich ? `${person.name} (Sie)` : person.name;
}

/**
 * Wer den Schlüssel bekommen kann: der Mitarbeiterstamm ohne die Person, bei
 * der er schon liegt - die eigene Person zuerst, sonst in der Reihenfolge des
 * Stamms. Aus dem Stamm, nicht als Freitext: Der Schlüsselstand hinge sonst
 * an einer richtigen Selbstauskunft.
 */
export function empfaenger(flotte: Pick<Fleet, 'staff' | 'my_staff_member_id'>, rad: Bike) {
  const ich = flotte.my_staff_member_id;
  const moegliche = flotte.staff.filter((person) => person.id !== rad.key?.holder_staff_id);
  return [
    ...moegliche.filter((person) => person.id === ich),
    ...moegliche.filter((person) => person.id !== ich),
  ];
}

/**
 * Wo der Ablauf beginnt: Mit einem Rad aus der Adresse, das zur Wahl steht,
 * gleich bei „An wen?“; ein gesperrtes oder unbekanntes Rad übernimmt er
 * nicht - dann bei der Radwahl, nichts vorgewählt (VOR-18).
 */
export function beginn(
  flotte: Pick<Fleet, 'bikes'>,
  vorgabe: string | null,
): { seite: Seite; radId: string | null } {
  const rad = vorgabe ? raederZurWahl(flotte).find((eintrag) => eintrag.id === vorgabe) : undefined;
  return rad ? { seite: 'person', radId: rad.id } : { seite: 'rad', radId: null };
}

/**
 * Die gewählte Person nach einem anderen Rad: Sie bleibt, außer der Schlüssel
 * des neuen Rads liegt schon bei ihr - dann ist „An wen?“ neu zu beantworten.
 */
export function personNachRadwahl(rad: Bike, personId: string | null): string | null {
  return personId !== null && personId !== rad.key?.holder_staff_id ? personId : null;
}

/** Was der Hauptknopf tut, wie er heißt und was danach gesagt wird. */
export type Vorgang =
  | {
      art: 'eintragen';
      /** `null`: die angemeldete Person nimmt ihn selbst (`take_fleet_key`). */
      holderStaffId: string | null;
      knopf: string;
      laeuft: string;
    }
  | { art: 'uebergeben'; holderStaffId: string; knopf: string; laeuft: string };

export function vorgang(rad: Bike, person: FleetStaff, ich: string | null): Vorgang {
  if (!rad.key) {
    return {
      art: 'eintragen',
      holderStaffId: person.id === ich ? null : person.id,
      knopf: 'Schlüssel eintragen',
      laeuft: 'Wird eingetragen …',
    };
  }
  return {
    art: 'uebergeben',
    holderStaffId: person.id,
    knopf: `Schlüssel an ${person.name} übergeben`,
    laeuft: 'Wird übergeben …',
  };
}

/** Von wem der Schlüssel kommt: Tresor oder die Person, bei der er liegt. */
export function vonText(rad: Bike, ich: string | null): string {
  if (!rad.key) return 'Tresor';
  const name = rad.key.holder_name ?? 'jemandem';
  return rad.key.holder_staff_id === ich ? `${name} (Sie)` : name;
}

/** Der Satz danach, auf der Radflotte - beim Eintragen wie bisher. */
export function meldung(rad: Bike, person: FleetStaff, ich: string | null): string {
  const selbst = person.id === ich;
  if (!rad.key)
    return `Schlüssel von ${rad.name} bei ${selbst ? 'Ihnen' : person.name} eingetragen.`;
  return `Schlüssel von ${rad.name} an ${selbst ? 'Sie' : person.name} übergeben.`;
}
