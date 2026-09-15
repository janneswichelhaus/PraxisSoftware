/**
 * Kalendertage als Anzeigetext.
 *
 * Ein `YYYY-MM-DD` aus der Datenbank ist ein Kalendertag und kein Zeitpunkt:
 * Geburtsdatum, Ausstellungstag einer Verordnung, letzter Behandlungstag. Er
 * wird deshalb ohne Zeitzonenrechnung formatiert - der 10.02.2026 bleibt der
 * 10.02.2026, unabhaengig davon, wo das Geraet steht.
 *
 * Zeitpunkte (`timestamptz`) gehoeren nicht hierher; sie brauchen die Zeitzone
 * der Praxis und werden in `@/features/appointments/api` formatiert.
 */
export function formatDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium' }).format(date);
}
