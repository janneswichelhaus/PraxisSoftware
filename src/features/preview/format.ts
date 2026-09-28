/**
 * Anzeigeformate des Vorschaugeruests.
 *
 * Bewusst ueber `Intl` mit fester Sprache. Kalendertage formatiert die
 * Anwendung an einer Stelle - die Vorschau nennt dieselbe Funktion nur in
 * ihrem eigenen Vokabular.
 */
export { formatDate as formatDatum } from '@/lib/datum';
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
  const [jahr = 1970, monat = 1, tagImMonat = 1] = tag.split('-').map(Number);
  const [stunde = 0, minute = 0] = uhrzeit.split(':').map(Number);
  const wanduhr = Date.UTC(jahr, monat - 1, tagImMonat, stunde, minute);
  const erster = wanduhr - versatzMs(wanduhr, zeitzone);
  return new Date(wanduhr - versatzMs(erster, zeitzone)).toISOString();
}

/** Abstand der Zone zu UTC in Millisekunden, zum Augenblick `ms`. */
function versatzMs(ms: number, zeitzone: string): number {
  const teile = new Intl.DateTimeFormat('en-US', {
    timeZone: zeitzone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(new Date(ms));
  const zahl = (typ: Intl.DateTimeFormatPartTypes) =>
    Number(teile.find((teil) => teil.type === typ)?.value ?? '0');
  const alsUtc = Date.UTC(
    zahl('year'),
    zahl('month') - 1,
    zahl('day'),
    zahl('hour'),
    zahl('minute'),
    zahl('second'),
  );
  return alsUtc - Math.floor(ms / 1000) * 1000;
}

/**
 * Monat aus einem `<input type="month">` („2026-08") als „August 2026" (VOR-24).
 *
 * Gerechnet über UTC: ein Monat ist ein Kalenderwert wie ein Tag, kein
 * Zeitpunkt. Was nicht dem Format entspricht, bleibt unverändert stehen.
 */
export function formatMonat(monat: string): string {
  const treffer = /^(\d{4})-(\d{2})$/.exec(monat);
  if (!treffer) return monat;
  return new Intl.DateTimeFormat('de-DE', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(Number(treffer[1]), Number(treffer[2]) - 1, 1)));
}

export function formatStunden(stunden: number): string {
  const vorzeichen = stunden > 0 ? '+' : '';
  return `${vorzeichen}${new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 }).format(stunden)} h`;
}
