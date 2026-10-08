import type { EigenerPlan } from './api';

/**
 * Übungstage (UEB-011, IDEA-ORG-004, ANN-307): reine Rechnung ohne
 * Datenzugriff. Wochentage nach ISO: 1 Montag bis 7 Sonntag.
 */

export const WOCHENTAGE: readonly { nummer: number; kurz: string; lang: string }[] = [
  { nummer: 1, kurz: 'Mo', lang: 'Montag' },
  { nummer: 2, kurz: 'Di', lang: 'Dienstag' },
  { nummer: 3, kurz: 'Mi', lang: 'Mittwoch' },
  { nummer: 4, kurz: 'Do', lang: 'Donnerstag' },
  { nummer: 5, kurz: 'Fr', lang: 'Freitag' },
  { nummer: 6, kurz: 'Sa', lang: 'Samstag' },
  { nummer: 7, kurz: 'So', lang: 'Sonntag' },
];

/** Der ISO-Wochentag eines Kalendertags `YYYY-MM-DD`. */
export function isoWochentag(kalendertag: string): number {
  const tag = new Date(`${kalendertag}T12:00:00`).getDay();
  return tag === 0 ? 7 : tag;
}

/** `anzahl` Kalendertage ab `ab` (einschließlich) als `YYYY-MM-DD`. */
export function tageAb(ab: string, anzahl: number): string[] {
  const d = new Date(`${ab}T12:00:00`);
  return Array.from({ length: anzahl }, (_, i) => {
    const t = new Date(d);
    t.setDate(d.getDate() + i);
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  });
}

/** Die Pläne, an denen dieser Tag ein Übungstag ist - nur innerhalb der Laufzeit. */
export function uebungstageAm(plaene: EigenerPlan[], kalendertag: string): EigenerPlan[] {
  const wochentag = isoWochentag(kalendertag);
  return plaene.filter(
    (p) =>
      p.status === 'assigned' &&
      p.weekdays.includes(wochentag) &&
      (!p.runs_from || p.runs_from <= kalendertag) &&
      (!p.runs_until || kalendertag <= p.runs_until),
  );
}

/** „Mo, Mi, Fr" */
export function tageText(wochentage: number[]): string {
  return WOCHENTAGE.filter((w) => wochentage.includes(w.nummer))
    .map((w) => w.kurz)
    .join(', ');
}
