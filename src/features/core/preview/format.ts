/** Anzeigeformate des Vorschaugeruests, bewusst ueber `Intl` mit fester Sprache. */

import { zeitpunktIn } from '@/lib/datum';

// parseEuroZuCent kam mit R3-018 dazu: Der Vorschaubereich hatte einen
// eigenen Geldparser mit abweichender Semantik ('1e3' als tausend Euro,
// '1,005' auf 1,00 abgerundet). Gerechnet wird ueberall dieselbe Funktion.
export { formatEuro, parseEuroZuCent } from '@/lib/geld';

/**
 * Zeitzone der Vorschau, wenn die Praxis keine nennt (VOR-06).
 *
 * Die synthetischen Zeitpunkte sind Ortszeiten dieser Zone (`demodaten.ts`),
 * neue Einträge nehmen den tatsächlichen Augenblick. Beides zeigt die Vorschau
 * in der Praxiszeitzone. Bis VOR-06 stand hier `UTC`: Eine Aktion um 14:05 Uhr
 * erschien im Sommer als 12:05, und der Schlüsselverlauf meldete eine Rückgabe
 * vor der Entnahme.
 */
export const VORSCHAU_ZEITZONE = 'Europe/Berlin';

/**
 * Zeitpunkt als „27.09.2026, 08:56" in der Zeitzone der Praxis.
 *
 * Eine eigene Formatierung und kein Import aus `appointments/api`: Aus echten
 * API-Modulen darf die Vorschau nur `todayInTimeZone` beziehen
 * (`trennung.test.ts`). Ohne Zeitzone gilt `VORSCHAU_ZEITZONE`.
 */
export function formatZeitpunkt(iso: string, zeitzone?: string | null): string {
  if (!iso) return '–';
  const datum = new Date(iso);
  if (Number.isNaN(datum.getTime())) return iso;
  return new Intl.DateTimeFormat('de-DE', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: zeitzone ?? VORSCHAU_ZEITZONE,
  }).format(datum);
}

/**
 * Ortszeit eines Kalendertags in einer Zeitzone als Zeitpunkt (ISO, UTC).
 *
 * Für die synthetischen Daten: „Schlüssel seit 07:40" meint 07:40 Uhr in der
 * Praxis, nicht 07:40 UTC. Der Versatz der Zone kommt aus `Intl` und wird am
 * Ergebnis ein zweites Mal geprüft - an einem Umstellungstag gilt er dort,
 * nicht an der Wanduhrzeit.
 */
export function ortszeitAlsZeitpunkt(
  tag: string,
  uhrzeit: string,
  zeitzone: string = VORSCHAU_ZEITZONE,
): string {
  const [stunde = 0, minute = 0] = uhrzeit.split(':').map(Number);
  return zeitpunktIn(tag, stunde * 60 + minute, zeitzone);
}
