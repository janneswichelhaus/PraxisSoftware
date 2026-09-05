/**
 * Anzeigeformate des Vorschaugeruests.
 *
 * Bewusst ueber `Intl` mit fester Sprache und - bei Kalendertagen - fester
 * Zeitzone UTC: Ein `YYYY-MM-DD` ist ein Kalendertag und kein Zeitpunkt; ohne
 * ausdrueckliche Zeitzone waere er je nach Geraet einen Tag daneben.
 */

export function formatEuro(cent: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(cent / 100);
}

export function formatDatum(tag: string): string {
  if (!tag) return '–';
  const datum = new Date(`${tag}T00:00:00Z`);
  if (Number.isNaN(datum.getTime())) return tag;
  return new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeZone: 'UTC' }).format(datum);
}

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
