import { todayInTimeZone } from '@/features/appointments/api';

/**
 * Wann eine Nachricht kam, so kurz wie möglich: heute nur die Uhrzeit,
 * gestern mit „gestern“, sonst mit Tag und Monat (und Jahr, wenn es ein
 * anderes ist). Immer in der Zeitzone der Praxis.
 */
export function nachrichtenzeit(iso: string, zeitzone: string, jetzt = new Date()): string {
  const zeitpunkt = new Date(iso);
  const tag = todayInTimeZone(zeitzone, zeitpunkt);
  const heute = todayInTimeZone(zeitzone, jetzt);
  const gestern = todayInTimeZone(zeitzone, new Date(jetzt.getTime() - 86_400_000));
  const uhr = new Intl.DateTimeFormat('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: zeitzone,
  }).format(zeitpunkt);
  if (tag === heute) return uhr;
  if (tag === gestern) return `gestern, ${uhr}`;
  const [jahr, monat, tagImMonat] = tag.split('-');
  const datum = `${Number(tagImMonat)}.${Number(monat)}.`;
  return jahr === heute.slice(0, 4) ? `${datum}, ${uhr}` : `${datum}${jahr}, ${uhr}`;
}

/**
 * Der Tagestrenner im Gespräch (ANN-614): „Heute“, „Gestern“, sonst Wochentag
 * und Datum - in der Zeitzone der Praxis.
 */
export function tagestrenner(iso: string, zeitzone: string, jetzt = new Date()): string {
  const tag = todayInTimeZone(zeitzone, new Date(iso));
  if (tag === todayInTimeZone(zeitzone, jetzt)) return 'Heute';
  if (tag === todayInTimeZone(zeitzone, new Date(jetzt.getTime() - 86_400_000))) return 'Gestern';
  const mittag = new Date(`${tag}T12:00:00Z`);
  const mitJahr = tag.slice(0, 4) !== todayInTimeZone(zeitzone, jetzt).slice(0, 4);
  return new Intl.DateTimeFormat('de-DE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    ...(mitJahr ? { year: 'numeric' } : {}),
    timeZone: 'UTC',
  }).format(mittag);
}

/** Der Tag einer Nachricht in der Zeitzone der Praxis, `YYYY-MM-DD`. */
export function nachrichtentag(iso: string, zeitzone: string): string {
  return todayInTimeZone(zeitzone, new Date(iso));
}
