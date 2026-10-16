import type { Bike, Depot, Fleet } from './api';
import type { Wochentag } from './format';

/**
 * Der Zustand eines Rads, abgeleitet statt gespeichert (ANN-557): gesperrt
 * heißt „In Reparatur“, ein entnommener Schlüssel „Im Einsatz“, sonst
 * „Verfügbar“. Es gibt kein Statusfeld, das neben Sperre und Schlüssel
 * auseinanderlaufen könnte.
 */
export type Radzustand = 'verfuegbar' | 'einsatz' | 'reparatur';

export const radzustandLabels: Record<Radzustand, string> = {
  verfuegbar: 'Verfügbar',
  einsatz: 'Im Einsatz',
  reparatur: 'In Reparatur',
};

export function radzustand(rad: Pick<Bike, 'block' | 'key'>): Radzustand {
  if (rad.block) return 'reparatur';
  if (rad.key) return 'einsatz';
  return 'verfuegbar';
}

/** Wo das Rad gerade steht: ein Depot oder ein benannter anderer Ort. */
export function standort(rad: Bike, depots: readonly Depot[]): string {
  if (rad.current_depot_id) {
    return depots.find((depot) => depot.id === rad.current_depot_id)?.name ?? 'Depot';
  }
  return rad.special_location ?? 'Anderer Ort';
}

export function depotName(depots: readonly Depot[], id: string): string {
  return depots.find((depot) => depot.id === id)?.name ?? 'Depot';
}

/** Steht das Rad woanders als in seinem Stammdepot? */
export function ausserhalbDesStammdepots(rad: Bike): boolean {
  return rad.current_depot_id !== rad.home_depot_id;
}

export interface Belegung {
  belegt: boolean;
  /** Frei, weil die Stammnutzer:in an dem Tag ganztägig abwesend ist. */
  wegenAbwesenheit: boolean;
}

/**
 * Die Belegung eines Rads an einem Tag der Woche: Der Wochenplan sagt, wann
 * die Stammnutzer:in es üblicherweise fährt; ist sie an dem Tag ganztägig
 * abwesend (Arbeitszeiten, CAL-005), ist es trotzdem frei.
 */
export function belegung(
  rad: Bike,
  tag: Wochentag,
  datum: string,
  abwesend: Fleet['unavailable'],
): Belegung {
  if (rad.is_spare || !rad.regular_rider || !rad.planned_weekdays.includes(tag)) {
    return { belegt: false, wegenAbwesenheit: false };
  }
  const riderId = rad.regular_rider.id;
  const weg = abwesend.some(
    (eintrag) => eintrag.staff_member_id === riderId && eintrag.on_date === datum,
  );
  return { belegt: !weg, wegenAbwesenheit: weg };
}

/** Das Ersatzrad der Flotte für die Texte des Pannenablaufs - sonst „das Ersatzrad“. */
export function ersatzradName(fleet: Pick<Fleet, 'bikes'>): string {
  return fleet.bikes.find((rad) => rad.is_spare)?.name ?? 'das Ersatzrad';
}

/** Ist das Rad „meines“: Stammrad oder Schlüssel bei mir? */
export function istMeinRad(rad: Bike, ich: string | null): boolean {
  if (!ich) return false;
  return rad.regular_rider?.id === ich || rad.key?.holder_staff_id === ich;
}

/** Ein Rad in einer Auswahl: Name, Standort und - als Ausnahme - „In Reparatur“. */
export function radMitStandort(rad: Bike, flotte: Pick<Fleet, 'depots'>): string {
  const teile = [rad.name, standort(rad, flotte.depots)];
  if (rad.block) teile.push(radzustandLabels.reparatur);
  return teile.join(' · ');
}
