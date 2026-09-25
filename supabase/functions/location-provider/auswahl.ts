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
import type { Anbieteradapter } from './typen.ts';

/** Nur die Felder, die diese Function tatsächlich liest. */
export interface Umgebung {
  readonly LOCATION_PROVIDER?: string | undefined;
  readonly PTV_API_KEY?: string | undefined;
  readonly LOCATION_DATA_GATE?: string | undefined;
}

/**
 * Der Umschalter aus ADR-019 Punkt 25 — **ANN-094**.
 *
 * Ein echter Anbieter antwortet nur, wenn die Umgebung ausdrücklich sagt,
 * welche Adressen sie trägt: `synthetic` für Entwicklungs- und
 * Test-Umgebungen, die nach §3.1 nur synthetische Daten kennen, `released`
 * erst nach dem Gate aus ADR-019 Punkt 9 (Vertrag, §203, DSFA,
 * Edge Runtime). Fehlt der Wert oder ist er falsch geschrieben, gilt der
 * Anbieter als nicht eingerichtet — der Schalter steht zu, bis ihn jemand
 * bewusst öffnet. `released` in einer Umgebung mit echten Daten zu setzen
 * ist eine Go-live-Vorbedingung (ADR-007 Punkt 5), kein Konfigurationsdetail.
 *
 * Die Nachbildung braucht den Schalter nicht: Sie schickt nichts hinaus.
 */
export const DATENFREIGABEN = ['synthetic', 'released'] as const;

export function waehleAdapter(umgebung: Umgebung): Anbieteradapter | null {
  const anbieter = (umgebung.LOCATION_PROVIDER ?? '').trim().toLowerCase();
  const schluessel = (umgebung.PTV_API_KEY ?? '').trim();
  const freigabe = (umgebung.LOCATION_DATA_GATE ?? '').trim().toLowerCase();

  if (anbieter === 'mock') return erstelleNachbildung();
  if (!(DATENFREIGABEN as readonly string[]).includes(freigabe)) return null;
  // Der Anbieter ohne Schlüssel ist keine halbe Einrichtung, sondern keine:
  // Jeder Aufruf endete beim Anbieter mit 401.
  if (anbieter === 'ptv' && schluessel !== '') return erstellePtvAdapter({ apiKey: schluessel });
  return null;
}
