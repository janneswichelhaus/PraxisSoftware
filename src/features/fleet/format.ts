/**
 * Zeitpunkte und Wochentage der Radflotte.
 *
 * Zeitpunkte (Schlüssel seit, Check-Up am, gesperrt seit) stehen in der
 * Zeitzone der Praxis, über `Intl` mit ausdrücklicher Zone - wie die Termine
 * (`@/features/appointments/api`). Wochentage zählen nach ISO: 1 ist Montag,
 * 7 Sonntag, wie `fleet_bikes.planned_weekdays` in der Datenbank.
 */

/** Ohne bekannte Zone: die der Praxis in Tübingen (CAL-001). */
const ERSATZZONE = 'Europe/Berlin';

/** „14.10.2026, 16:20“ in der Zone der Praxis. */
export function formatZeitpunkt(iso: string, zone: string | null): string {
  const datum = new Date(iso);
  if (Number.isNaN(datum.getTime())) return '–';
  return new Intl.DateTimeFormat('de-DE', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: zone ?? ERSATZZONE,
  }).format(datum);
}

/** „14.10.2026“ in der Zone der Praxis. */
export function formatTag(iso: string, zone: string | null): string {
  const datum = new Date(iso);
  if (Number.isNaN(datum.getTime())) return '–';
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: zone ?? ERSATZZONE,
  }).format(datum);
}

/** Der Kalendertag eines Zeitpunkts in der Zone der Praxis, als `YYYY-MM-DD`. */
export function kalendertag(iso: string, zone: string | null): string {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: zone ?? ERSATZZONE,
  }).format(new Date(iso));
}

export const WOCHENTAGE = [
  { nr: 1, kurz: 'Mo', lang: 'Montag' },
  { nr: 2, kurz: 'Di', lang: 'Dienstag' },
  { nr: 3, kurz: 'Mi', lang: 'Mittwoch' },
  { nr: 4, kurz: 'Do', lang: 'Donnerstag' },
  { nr: 5, kurz: 'Fr', lang: 'Freitag' },
  { nr: 6, kurz: 'Sa', lang: 'Samstag' },
  { nr: 7, kurz: 'So', lang: 'Sonntag' },
] as const;

export type Wochentag = (typeof WOCHENTAGE)[number]['nr'];

export function istWochentag(wert: number): wert is Wochentag {
  return Number.isInteger(wert) && wert >= 1 && wert <= 7;
}

/** Ein Kalendertag `YYYY-MM-DD` als Mittag in UTC - fern von jeder Umstellung. */
function mittag(tag: string): Date {
  return new Date(`${tag}T12:00:00Z`);
}

/** Der ISO-Wochentag eines Kalendertags (1 Montag … 7 Sonntag). */
export function wochentagVon(tag: string): Wochentag {
  const tagImSystem = mittag(tag).getUTCDay();
  return (tagImSystem === 0 ? 7 : tagImSystem) as Wochentag;
}

/** Ein Kalendertag plus `tage` Tage, als `YYYY-MM-DD`. */
export function plusTage(tag: string, tage: number): string {
  const datum = mittag(tag);
  datum.setUTCDate(datum.getUTCDate() + tage);
  return datum.toISOString().slice(0, 10);
}

/** Der Montag der Woche eines Kalendertags. */
export function montagDerWoche(tag: string): string {
  return plusTage(tag, 1 - wochentagVon(tag));
}

/** Die Kalendertage der Woche ab ihrem Montag, nach Wochentag. */
export function tageDerWoche(montag: string): Record<Wochentag, string> {
  return Object.fromEntries(
    WOCHENTAGE.map((tag) => [tag.nr, plusTage(montag, tag.nr - 1)]),
  ) as Record<Wochentag, string>;
}

/** „Mo, Di, Do, Fr“ - die Wochentage einer Liste in ihrer Reihenfolge. */
export function wochentageKurz(tage: readonly number[]): string {
  return WOCHENTAGE.filter((tag) => tage.includes(tag.nr))
    .map((tag) => tag.kurz)
    .join(', ');
}

/**
 * Der Dateiname der Unterlage für die Werkstatt, „Lastenrad-3_Werkstatt_2026-10-15“:
 * Rad, Zweck, Tag - keine Namen (Handoff Lastenrad 3D, Abschnitt 4). Ohne
 * Leer- und Sonderzeichen, damit ihn jedes Mailprogramm unverändert anhängt.
 */
export function dateinameWerkstatt(rad: string, tag: string): string {
  const teil = rad
    .normalize('NFC')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
  return `${teil || 'Rad'}_Werkstatt_${tag}`;
}
