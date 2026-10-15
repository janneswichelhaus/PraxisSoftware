import type { AppointmentStatus } from './api';

/**
 * Der Haken am Termin (B4, BEF-154, ADR-018 Fassung 5).
 *
 * Dokumentieren und Abhaken sind getrennt: Das Festschreiben der Doku hakt
 * nicht ab, der Haken setzt keine Doku voraus. Der Zustand eines Termins sagt
 * deshalb allein nicht mehr, ob er abgehakt ist - ein dokumentierter Termin
 * kann noch ohne Haken sein. Abgehakt heißt: erbracht (B7).
 *
 * `hakenAm` ist der Zeitpunkt des Hakens (`completed_at` am Termin,
 * `checked_at` in der Tagesliste). Fehlt die Angabe ganz (`undefined`, ein
 * älterer Stand), gilt ein dokumentierter Termin wie bisher als abgehakt.
 */
export function istAbgehakt(
  status: AppointmentStatus,
  hakenAm: string | null | undefined,
): boolean {
  if (status === 'completed' || status === 'invoiced') return true;
  if (status === 'documented') return hakenAm !== null;
  return false;
}

/** Steht der Haken noch aus? Bestätigt, oder dokumentiert ohne Haken. */
export function hakenFehlt(status: AppointmentStatus, hakenAm: string | null | undefined): boolean {
  return status === 'confirmed' || (status === 'documented' && hakenAm === null);
}

/**
 * Festgeschrieben, aber noch nicht abgehakt: Der Besuch ist vorbei, auch wenn
 * seine Zeit noch läuft - der Haken steht deshalb gleich an der Zeile.
 */
export function dokumentiertOhneHaken(
  status: AppointmentStatus,
  hakenAm: string | null | undefined,
): boolean {
  return status === 'documented' && hakenAm === null;
}

/**
 * Lässt sich der Haken zurücknehmen? Jederzeit, solange die Leistung nicht
 * abgerechnet ist - das prüft der Server (`reopen_appointment`); die Oberfläche
 * bietet es an jedem abgehakten Termin an, der nicht abgerechnet ist.
 */
export function hakenZuruecknehmbar(
  status: AppointmentStatus,
  hakenAm: string | null | undefined,
): boolean {
  return status !== 'invoiced' && istAbgehakt(status, hakenAm);
}
