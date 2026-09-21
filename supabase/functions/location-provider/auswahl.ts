/**
 * Welcher Adapter antwortet (MAP-003a).
 *
 * Die Wahl hängt an einem Secret, nicht an einem Schalter in der Oberfläche:
 * `LOCATION_PROVIDER=ptv` spricht den Anbieter an, `LOCATION_PROVIDER=mock`
 * die Nachbildung. Beides wird beim Start gelesen.
 *
 * **Alles andere ist „nicht eingerichtet" (`null`), nie stillschweigend die
 * Nachbildung** (ANN-090). Eine Nachbildung, die einspringt, weil ein Secret
 * fehlt oder falsch geschrieben ist, sähe auf der Karte aus wie eine Route —
 * und niemand erführe, dass die Einrichtung unvollständig ist.
 */

import { erstelleNachbildung } from './mock.ts';
import { erstellePtvAdapter } from './ptv.ts';
import type { RouteAdapter } from './typen.ts';

/** Nur die Felder, die diese Function tatsächlich liest. */
export interface Umgebung {
  readonly LOCATION_PROVIDER?: string | undefined;
  readonly PTV_API_KEY?: string | undefined;
}

export function waehleAdapter(umgebung: Umgebung): RouteAdapter | null {
  const anbieter = (umgebung.LOCATION_PROVIDER ?? '').trim().toLowerCase();
  const schluessel = (umgebung.PTV_API_KEY ?? '').trim();

  if (anbieter === 'mock') return erstelleNachbildung();
  // Der Anbieter ohne Schlüssel ist keine halbe Einrichtung, sondern keine:
  // Jeder Aufruf endete beim Anbieter mit 401.
  if (anbieter === 'ptv' && schluessel !== '') return erstellePtvAdapter({ apiKey: schluessel });
  return null;
}
