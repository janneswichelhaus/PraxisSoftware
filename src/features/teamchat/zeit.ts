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
