/**
 * Wege und Datumszeilen des Zeitkontos (ZK-001), geteilt von Übersicht,
 * Eintragen und Zurückweisen.
 */

export const PERSON_PARAM = 'person';
export const TIME_ACCOUNT_HOME = '/betrieb/zeitkonto';

const DATE = new Intl.DateTimeFormat('de-DE', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});

const DATE_WITH_YEAR = new Intl.DateTimeFormat('de-DE', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

/**
 * „Di., 14. Okt.“ für einen Kalendertag `YYYY-MM-DD` - aus einem anderen Jahr
 * als `today` mit Jahr.
 */
export function entryDate(day: string, today?: string): string {
  const format = today && today.slice(0, 4) !== day.slice(0, 4) ? DATE_WITH_YEAR : DATE;
  return format.format(new Date(`${day}T00:00:00Z`));
}

/** Das Konto einer Person auf derselben Seite. */
export function personPath(staffMemberId: string | null): string {
  return staffMemberId
    ? `${TIME_ACCOUNT_HOME}?${PERSON_PARAM}=${staffMemberId}`
    : TIME_ACCOUNT_HOME;
}
