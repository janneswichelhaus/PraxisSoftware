/** Der Tag eines Zeitpunkts in der Zeitzone der Praxis, zweistellig (WRT-15). */
export function formatDay(isoTimestamp: string, timeZone: string): string {
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone,
  }).format(new Date(isoTimestamp));
}
