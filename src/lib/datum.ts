/**
 * Ein Kalendertag `YYYY-MM-DD` aus der Datenbank (Geburtstag, Ausstellungstag) als Anzeigetext,
 * ohne Zeitzone: Der 10.02.2026 bleibt der 10.02.2026, wo auch immer das Gerät steht.
 */
export function formatDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium' }).format(date);
}

// Zeitpunkte in der Zeitzone der Praxis: nur über Intl.DateTimeFormat mit ausdrücklicher
// `timeZone`, ohne eigene Zonenarithmetik - Sommerzeit und Umstellungstage stimmen dort schon.

export function formatLocalDate(isoTimestamp: string, timeZone: string): string {
  return new Intl.DateTimeFormat('de-DE', { dateStyle: 'full', timeZone }).format(
    new Date(isoTimestamp),
  );
}

export function formatLocalTime(isoTimestamp: string, timeZone: string): string {
  return new Intl.DateTimeFormat('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
  }).format(new Date(isoTimestamp));
}

export function formatLocalTimeRange(startIso: string, endIso: string, timeZone: string): string {
  return `${formatLocalTime(startIso, timeZone)}–${formatLocalTime(endIso, timeZone)} Uhr`;
}

/** Heutiger Kalendertag in einer Zeitzone als `YYYY-MM-DD`; `en-CA` liefert genau dieses Format. */
export function todayInTimeZone(timeZone: string, now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone,
  }).format(now);
}

/** Kalendertag eines Zeitpunkts in der Zeitzone der Praxis, unabhängig von der des Browsers. */
export function dayKey(isoTimestamp: string, timeZone: string): string {
  return todayInTimeZone(timeZone, new Date(isoTimestamp));
}

/**
 * Kalendertag und Minuten seit Mitternacht in `timeZone` als ISO-Zeitpunkt in UTC. Der Versatz
 * wird am Ziel bestimmt und einmal nachgeprüft, damit die Rechnung über eine Zeitumstellung trägt.
 */
export function zeitpunktIn(datum: string, minute: number, timeZone: string): string {
  const [jahr, monat, tag] = datum.split('-').map(Number) as [number, number, number];
  const alsUtc = Date.UTC(jahr, monat - 1, tag, Math.floor(minute / 60), minute % 60);
  let ziel = alsUtc - zonenversatz(alsUtc, timeZone);
  ziel = alsUtc - zonenversatz(ziel, timeZone);
  return new Date(ziel).toISOString();
}

/** Ortszeit minus UTC in Millisekunden zum Zeitpunkt `ms`. */
function zonenversatz(ms: number, timeZone: string): number {
  const teile = new Intl.DateTimeFormat('en-GB', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
    timeZone,
  }).formatToParts(new Date(ms));
  const zahl = (typ: string) => Number(teile.find((t) => t.type === typ)?.value ?? '0');
  const ortszeit = Date.UTC(
    zahl('year'),
    zahl('month') - 1,
    zahl('day'),
    zahl('hour'),
    zahl('minute'),
    zahl('second'),
  );
  return ortszeit - Math.floor(ms / 1000) * 1000;
}

/** Minuten seit Mitternacht in einer Zeitzone - Grundlage der Anordnung. */
export function minutesOfDay(isoTimestamp: string, timeZone: string): number {
  const teile = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone,
  }).formatToParts(new Date(isoTimestamp));

  const zahl = (typ: string) => Number(teile.find((t) => t.type === typ)?.value ?? '0');
  return zahl('hour') * 60 + zahl('minute');
}

// Rechnen auf Kalendertagen `YYYY-MM-DD` über UTC-verankerte Dates, ohne Ortszeit.

const ISO_DATUM = /^\d{4}-\d{2}-\d{2}$/;

/** Prüft ein `YYYY-MM-DD` samt tatsächlicher Existenz des Tages. */
export function istIsoDatum(wert: string | null | undefined): wert is string {
  if (!wert || !ISO_DATUM.test(wert)) return false;
  const d = new Date(`${wert}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return false;
  // Fängt den 31. Februar ab: Date normalisiert still auf den 3. März.
  return d.toISOString().slice(0, 10) === wert;
}

function alsDate(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

function alsIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Verschiebt einen Kalendertag um ganze Tage. */
export function tagePlus(iso: string, tage: number): string {
  const d = alsDate(iso);
  d.setUTCDate(d.getUTCDate() + tage);
  return alsIso(d);
}

/** ISO-8601-Wochentag eines Kalendertags: 1 = Montag … 7 = Sonntag. */
export function isoWochentag(iso: string): number {
  // getUTCDay: 0 = Sonntag. Die Woche beginnt am Montag.
  return ((alsDate(iso).getUTCDay() + 6) % 7) + 1;
}

/** Montag der Woche, in der dieser Tag liegt. */
export function wochenBeginn(iso: string): string {
  return tagePlus(iso, 1 - isoWochentag(iso));
}

/** Kalenderwoche nach ISO 8601: Woche 1 ist die mit dem ersten Donnerstag des Jahres. */
export function kalenderwoche(iso: string): number {
  // Der Donnerstag derselben Woche entscheidet über das Jahr der Woche.
  const donnerstag = alsDate(tagePlus(wochenBeginn(iso), 3));
  const jahresBeginn = Date.UTC(donnerstag.getUTCFullYear(), 0, 1);
  return Math.floor((donnerstag.getTime() - jahresBeginn) / 86_400_000 / 7) + 1;
}

/** Erster Tag des Monats, in dem dieser Tag liegt. */
export function monatsBeginn(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

/** Derselbe Monatserste, um ganze Monate verschoben. */
export function monatPlus(monatsErster: string, monate: number): string {
  const d = alsDate(monatsErster);
  d.setUTCMonth(d.getUTCMonth() + monate, 1);
  return alsIso(d);
}

// Kalendertage als Text, ebenfalls über UTC: Der Tag bleibt derselbe, wo auch immer das Gerät steht.

const LONG = new Intl.DateTimeFormat('de-DE', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
});

/** „Dienstag, 3. November“ für einen Kalendertag `YYYY-MM-DD`. */
export function dateLong(day: string): string {
  return LONG.format(alsDate(day));
}

const DAY_MONTH = new Intl.DateTimeFormat('de-DE', {
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
});

/** „1. Dezember“ für einen Kalendertag `YYYY-MM-DD`. */
export function dateDayMonth(day: string): string {
  return DAY_MONTH.format(alsDate(day));
}

/**
 * Monatsnamen in der Kurzform des Duden - fest, weil `Intl` sie je nach
 * ICU-Stand mit oder ohne Punkt liefert.
 */
const MONAT_KURZ = [
  'Jan.',
  'Feb.',
  'März',
  'Apr.',
  'Mai',
  'Juni',
  'Juli',
  'Aug.',
  'Sept.',
  'Okt.',
  'Nov.',
  'Dez.',
] as const;

function teile(tag: string) {
  const d = alsDate(tag);
  return { tag: d.getUTCDate(), monat: MONAT_KURZ[d.getUTCMonth()]!, jahr: d.getUTCFullYear() };
}

/** „Okt.“ - ein Monat als Kachel beim Wählen (das Jahr steht darüber). */
export function monatKurz(monat: string): string {
  return teile(monat).monat;
}

const MONATSNAME = new Intl.DateTimeFormat('de-DE', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

/** „Oktober 2026“ - der Name eines Monats, etwa für Vorlesesoftware. */
export function monatLang(monat: string): string {
  return MONATSNAME.format(alsDate(monat));
}

/** „3. Okt.“ - ein Tag im laufenden Monat, etwa ein Feiertag. */
export function tagKurz(tag: string): string {
  const t = teile(tag);
  return `${t.tag}. ${t.monat}`;
}

/**
 * „4.–15. Aug. 2027“, „28. Dez. 2027 – 8. Jan. 2028“, ein Tag: „4. Aug. 2027“.
 * Ohne Jahr, wenn es das laufende ist (`ohneJahr`).
 */
export function zeitraumText(von: string, bis: string, ohneJahr: number | null = null): string {
  const a = teile(von);
  const b = teile(bis);
  const jahr = (j: number) => (j === ohneJahr ? '' : ` ${j}`);
  if (von === bis) return `${a.tag}. ${a.monat}${jahr(a.jahr)}`;
  if (a.jahr === b.jahr && a.monat === b.monat) {
    return `${a.tag}.–${b.tag}. ${b.monat}${jahr(b.jahr)}`;
  }
  if (a.jahr === b.jahr) return `${a.tag}. ${a.monat} – ${b.tag}. ${b.monat}${jahr(b.jahr)}`;
  return `${a.tag}. ${a.monat} ${a.jahr} – ${b.tag}. ${b.monat} ${b.jahr}`;
}
