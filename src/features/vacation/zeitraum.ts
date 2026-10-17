import { STATUSZEICHEN, type Ton } from '@/components/ui/Badge';
import { tagePlus } from '@/features/appointments/calendar';
import type { Antragsstatus } from './api';

/**
 * Rechnen und Schreiben rund um einen Urlaubszeitraum (URL-001), ohne
 * Oberfläche. Kalendertage sind `YYYY-MM-DD` und werden über UTC gerechnet -
 * Ortszeit spielt für ganze Tage keine Rolle. Die Urlaubstage selbst zählt
 * der Server (ANN-577); hier steht nur, was die Seite zum Wählen und Zeigen
 * braucht.
 */

export interface Zeitraumwahl {
  von: string | null;
  bis: string | null;
}

export const KEINE_WAHL: Zeitraumwahl = { von: null, bis: null };

/**
 * Ein Tipp im Kalender: Der erste wählt den Beginn, der zweite das Ende. Ein
 * Tag vor dem Beginn beginnt neu, ebenso ein Tipp nach einer vollständigen
 * Wahl - so ist jeder Irrtum mit einem Tipp behoben. Derselbe Tag zweimal ist
 * ein einzelner Urlaubstag.
 */
export function waehleTag(wahl: Zeitraumwahl, tag: string): Zeitraumwahl {
  if (!wahl.von || wahl.bis) return { von: tag, bis: null };
  if (tag < wahl.von) return { von: tag, bis: null };
  return { von: wahl.von, bis: tag };
}

/** Die gewählten Tage, aufsteigend; ohne Ende nur der Beginn. */
export function gewaehlteTage(wahl: Zeitraumwahl): string[] {
  if (!wahl.von) return [];
  const bis = wahl.bis ?? wahl.von;
  const tage: string[] = [];
  // Höchstens 93 Tage trägt ein Antrag; die Grenze schützt vor einer Schleife.
  for (let tag = wahl.von, n = 0; tag <= bis && n < 400; tag = tagePlus(tag, 1), n += 1) {
    tage.push(tag);
  }
  return tage;
}

/** Ob ein Zeitraum vollständig ist. */
export function vollstaendig(wahl: Zeitraumwahl): wahl is { von: string; bis: string } {
  return wahl.von !== null && wahl.bis !== null;
}

/** Länge eines Zeitraums in Kalendertagen. */
export function kalendertage(von: string, bis: string): number {
  return (
    Math.round((Date.parse(`${bis}T00:00:00Z`) - Date.parse(`${von}T00:00:00Z`)) / 86_400_000) + 1
  );
}

export function ueberschneidet(
  a: { starts_on: string; ends_on: string },
  von: string,
  bis: string,
): boolean {
  return a.starts_on <= bis && von <= a.ends_on;
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
  const d = new Date(`${tag}T00:00:00Z`);
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

/** „Oktober 2026“ - der Name einer Monatskachel für Vorlesesoftware. */
export function monatLang(monat: string): string {
  return MONATSNAME.format(new Date(`${monat}T00:00:00Z`));
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

/** „1 Urlaubstag“, „9 Urlaubstage“ - ohne Umbruch zwischen Zahl und Wort. */
export function urlaubstage(anzahl: number): string {
  return `${anzahl}\u00a0${anzahl === 1 ? 'Urlaubstag' : 'Urlaubstage'}`;
}

/** „1 Tag“, „9 Tage“. */
export function tage(anzahl: number): string {
  return `${anzahl}\u00a0${anzahl === 1 ? 'Tag' : 'Tage'}`;
}

/**
 * Der Stand eines eigenen Antrags als Wort und Ton (Status = Zeichen + Wort);
 * ein Zustand ohne eigenen Ton bringt sein Zeichen mit: „× Zurückgezogen“ wie
 * „× Abgesagt“ (Design-Review Überholung 10).
 */
export function statusAnzeige(
  status: Antragsstatus,
  stornoOffen: boolean,
): { text: string; ton: Ton; zeichen?: string } | null {
  if (stornoOffen) return { text: 'Storno beantragt', ton: 'warnung' };
  switch (status) {
    case 'requested':
      return { text: 'Beantragt', ton: 'warnung' };
    case 'approved':
      return { text: 'Genehmigt', ton: 'positiv' };
    case 'rejected':
      return { text: 'Abgelehnt', ton: 'kritisch' };
    case 'withdrawn':
      return { text: 'Zurückgezogen', ton: 'neutral', zeichen: STATUSZEICHEN.abgelehnt };
    case 'cancelled':
      return { text: 'Storniert', ton: 'neutral', zeichen: STATUSZEICHEN.abgelehnt };
  }
}
