import { tagePlus } from '@/lib/datum';

// Die Rechnung hinter der Wochenleiste (`Wochenleiste.tsx`), als reine
// Funktionen in eigener Datei - wie `travelPlan.ts` (react-refresh).

/** Ganze Tage von `von` bis `bis`, beide als JJJJ-MM-TT. */
function tageZwischen(von: string, bis: string): number {
  return Math.round((Date.parse(`${bis}T12:00:00Z`) - Date.parse(`${von}T12:00:00Z`)) / 86_400_000);
}

/**
 * Der erste Tag des Fensters, in dem `tag` steht: heute, oder eine ganze Zahl
 * von Wochen davor oder danach. So springt die Leiste nicht, solange man
 * innerhalb der sieben Tage ab heute wählt.
 */
export function fensterAnfang(tag: string, heute: string): string {
  return tagePlus(heute, Math.floor(tageZwischen(heute, tag) / 7) * 7);
}

/** Die sieben Tage des Fensters, in dem `tag` steht. */
export function fensterTage(tag: string, heute: string): string[] {
  const anfang = fensterAnfang(tag, heute);
  return Array.from({ length: 7 }, (_, index) => tagePlus(anfang, index));
}

export const KURZ = new Intl.DateTimeFormat('de-DE', { weekday: 'short', timeZone: 'UTC' });
const LANG = new Intl.DateTimeFormat('de-DE', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
});

export function alsDatum(tag: string): Date {
  return new Date(`${tag}T12:00:00Z`);
}

/**
 * Was ein Punkt zählt: jeder eigene Termin, der stattfindet - Behandlung oder
 * Training, keine Fehlzeit und nichts Abgesagtes.
 */
export function terminAnzahl(plan: readonly { kind: string; status: string }[]): number {
  return plan.filter((termin) => termin.kind !== 'internal' && termin.status !== 'cancelled')
    .length;
}

/** „Montag, 12. Oktober: 4 Termine" - der Name des Links für Vorlesesoftware. */
export function tagesName(tag: string, heute: string, anzahl: number | undefined): string {
  const teile = [LANG.format(alsDatum(tag))];
  if (tag === heute) teile.push('heute');
  const name = teile.join(', ');
  if (anzahl === undefined) return name;
  if (anzahl === 0) return `${name}: keine Termine`;
  return `${name}: ${anzahl} ${anzahl === 1 ? 'Termin' : 'Termine'}`;
}

const KOPF = new Intl.DateTimeFormat('de-DE', {
  weekday: 'long',
  day: '2-digit',
  month: '2-digit',
  timeZone: 'UTC',
});

/** „Montag, 12.10." - für die Kopfzeile eines Tagesblocks. */
export function kopfDatum(tag: string): string {
  return KOPF.format(alsDatum(tag));
}
