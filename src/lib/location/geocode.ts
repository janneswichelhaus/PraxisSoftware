/**
 * Geocoding einer Anschrift über die eigene Function (MAP-006a, ANN-016).
 *
 * **Nur beim Anlegen oder Ändern einer Adresse**, nie beim Öffnen einer Karte
 * oder beim Berechnen einer Route (ADR-019 Punkt 14). Deshalb gibt es hier
 * bewusst keinen Hook, der beim Anzeigen feuert: Aufrufen darf das nur eine
 * ausdrückliche Handlung nach dem Speichern der Adresse.
 *
 * Hinaus gehen die fünf Felder der Anschrift, kein Name, keine Kennung
 * (Punkt 12). Das Ergebnis wird angezeigt; gespeichert wird allein die
 * Koordinate mit ihrer Genauigkeit über die Datenbankfunktion, nie der
 * Anzeigetext des Treffers.
 */

import type { GeocodeResult, PostalAddress } from './contract';
import { rufeFunktionAuf, type Funktionsergebnis } from './funktion';

/** Die Genauigkeit, ab der kein Bestätigen nötig ist (ANN-016). */
export const OHNE_BESTAETIGUNG: GeocodeResult['precision'] = 'address';

/** Wie die Oberfläche die Genauigkeit eines Treffers nennt. */
export const GENAUIGKEIT_TEXT: Record<GeocodeResult['precision'], string> = {
  address: 'auf die Hausnummer genau',
  street: 'nur auf die Straße genau',
  locality: 'nur auf den Ort genau',
  unknown: 'Genauigkeit unbekannt',
};

/** Muss die Person den Treffer bestätigen, bevor er gespeichert wird? */
export function brauchtBestaetigung(treffer: GeocodeResult): boolean {
  return treffer.precision !== OHNE_BESTAETIGUNG;
}

export function geocodiere(
  anschrift: PostalAddress,
  signal?: AbortSignal,
): Promise<Funktionsergebnis<GeocodeResult>> {
  const address: PostalAddress = {
    street: anschrift.street,
    houseNumber: anschrift.houseNumber,
    postalCode: anschrift.postalCode,
    city: anschrift.city,
    countryCode: anschrift.countryCode,
  };
  return rufeFunktionAuf('geocode', { address }, istTreffer, signal);
}

const GENAUIGKEITEN: readonly GeocodeResult['precision'][] = [
  'address',
  'street',
  'locality',
  'unknown',
];

function istTreffer(wert: unknown): wert is GeocodeResult {
  if (typeof wert !== 'object' || wert === null) return false;
  const daten = wert as Record<string, unknown>;
  const punkt = daten['position'] as Record<string, unknown> | undefined;
  return (
    typeof punkt?.['lat'] === 'number' &&
    typeof punkt['lon'] === 'number' &&
    GENAUIGKEITEN.includes(daten['precision'] as GeocodeResult['precision'])
  );
}
