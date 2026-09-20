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

export function formatZeitpunkt(iso: string): string {
  if (!iso) return '–';
  const datum = new Date(iso);
  if (Number.isNaN(datum.getTime())) return iso;
  return new Intl.DateTimeFormat('de-DE', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(datum);
}

export function formatStunden(stunden: number): string {
  const vorzeichen = stunden > 0 ? '+' : '';
  return `${vorzeichen}${new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 }).format(stunden)} h`;
}
