import { isoWochentag, tagePlus, todayInTimeZone, zeitpunktIn } from '@/lib/datum';

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

/** Ein Zeitpunkt zum Planen oder Erinnern (ANN-643, ANN-646). */
export interface Zeitvorschlag {
  text: string;
  /** ISO-Zeit in UTC. */
  um: string;
}

/** Der nächste Werktag nach `tag` (Montag bis Freitag). */
function naechsterWerktag(tag: string): string {
  let naechster = tagePlus(tag, 1);
  while (isoWochentag(naechster) > 5) naechster = tagePlus(naechster, 1);
  return naechster;
}

/**
 * Wann eine geplante Nachricht gehen soll (ANN-643): zum Dienstbeginn des
 * nächsten Werktags, am nächsten Mittag - Zeiten, die niemanden in der
 * Freizeit erreichen. In der Zeitzone der Praxis.
 */
export function planvorschlaege(zeitzone: string, jetzt = new Date()): Zeitvorschlag[] {
  const heute = todayInTimeZone(zeitzone, jetzt);
  const morgen = tagePlus(heute, 1);
  const werktag = naechsterWerktag(heute);
  const vorschlaege: Zeitvorschlag[] = [];
  if (werktag === morgen) {
    vorschlaege.push({ text: 'Morgen, 7:30', um: zeitpunktIn(morgen, 7 * 60 + 30, zeitzone) });
    vorschlaege.push({ text: 'Morgen, 12:00', um: zeitpunktIn(morgen, 12 * 60, zeitzone) });
  } else {
    const name = new Intl.DateTimeFormat('de-DE', { weekday: 'long', timeZone: 'UTC' }).format(
      new Date(`${werktag}T12:00:00Z`),
    );
    vorschlaege.push({ text: `${name}, 7:30`, um: zeitpunktIn(werktag, 7 * 60 + 30, zeitzone) });
    vorschlaege.push({ text: `${name}, 12:00`, um: zeitpunktIn(werktag, 12 * 60, zeitzone) });
  }
  return vorschlaege;
}

/** Wann „Für später“ erinnern soll (ANN-646). */
export function erinnerungsvorschlaege(zeitzone: string, jetzt = new Date()): Zeitvorschlag[] {
  const heute = todayInTimeZone(zeitzone, jetzt);
  const vorschlaege: Zeitvorschlag[] = [
    { text: 'In einer Stunde', um: new Date(jetzt.getTime() + 3_600_000).toISOString() },
  ];
  const nachmittag = zeitpunktIn(heute, 17 * 60, zeitzone);
  if (Date.parse(nachmittag) - jetzt.getTime() > 30 * 60_000) {
    vorschlaege.push({ text: 'Heute, 17:00', um: nachmittag });
  }
  vorschlaege.push({ text: 'Morgen, 8:00', um: zeitpunktIn(tagePlus(heute, 1), 8 * 60, zeitzone) });
  let montag = tagePlus(heute, 1);
  while (isoWochentag(montag) !== 1) montag = tagePlus(montag, 1);
  vorschlaege.push({
    text: 'Nächste Woche, Montag 8:00',
    um: zeitpunktIn(montag, 8 * 60, zeitzone),
  });
  return vorschlaege;
}

/** Ein frei gewählter Zeitpunkt aus Datum und Uhrzeit des Formulars. */
export function freieZeit(datum: string, uhrzeit: string, zeitzone: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datum) || !/^\d{2}:\d{2}$/.test(uhrzeit)) return null;
  const [stunde, minute] = uhrzeit.split(':').map(Number) as [number, number];
  return zeitpunktIn(datum, stunde * 60 + minute, zeitzone);
}

/** Wann etwas geplant ist, lesbar: „morgen, 07:30“, „Mo., 20.10., 08:00“. */
export function geplantFuer(iso: string, zeitzone: string, jetzt = new Date()): string {
  const tag = todayInTimeZone(zeitzone, new Date(iso));
  const heute = todayInTimeZone(zeitzone, jetzt);
  const uhr = new Intl.DateTimeFormat('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: zeitzone,
  }).format(new Date(iso));
  if (tag === heute) return `heute, ${uhr}`;
  if (tag === tagePlus(heute, 1)) return `morgen, ${uhr}`;
  const datum = new Intl.DateTimeFormat('de-DE', {
    weekday: 'short',
    day: 'numeric',
    month: 'numeric',
    timeZone: zeitzone,
  }).format(new Date(iso));
  return `${datum}, ${uhr}`;
}
