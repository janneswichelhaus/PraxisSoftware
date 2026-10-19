import { PLATTFORM_PFAD } from './pfade';

/** Wege und Tage des Ernährungstagebuchs (ERN-007) - der Tag steht in der Adresse, nie ein Lebensmittel. */
export const TAGEBUCH_PFAD = `${PLATTFORM_PFAD}/ernaehrung/tagebuch`;

/**
 * Eine Adresse unter dem Tagebuch mit der Suche der Seite (etwa `bereich`,
 * der den Zugang wählt) und den eigenen Angaben; `null` nimmt eine heraus.
 */
function mitSuche(pfad: string, suche: string, setzen: Record<string, string | null>): string {
  const p = new URLSearchParams(suche);
  for (const [schluessel, wert] of Object.entries(setzen)) {
    if (wert === null) p.delete(schluessel);
    else p.set(schluessel, wert);
  }
  const rest = p.toString();
  return rest === '' ? pfad : `${pfad}?${rest}`;
}

/** Der Tag im Tagebuch - `?tag=`, ohne Angabe heute. */
export function tagebuchAdresse(tag: string | null, suche: string, heute?: string): string {
  return mitSuche(TAGEBUCH_PFAD, suche, {
    tag: tag === null || tag === heute ? null : tag,
    mahlzeit: null,
  });
}

/** Eintragen zu einer Mahlzeit an einem Tag. */
export function eintragenAdresse(tag: string, mahlzeit: string, suche: string): string {
  return mitSuche(`${TAGEBUCH_PFAD}/eintragen`, suche, { tag, mahlzeit });
}

/** Ein Kalendertag `YYYY-MM-DD` plus `n` Tage. */
export function tagPlus(tag: string, n: number): string {
  const d = new Date(`${tag}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const TAG_LANG = new Intl.DateTimeFormat('de-DE', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

/** „Heute“, „Gestern“, sonst „Freitag, 17. Oktober“. */
export function tagName(tag: string, heute: string): string {
  if (tag === heute) return 'Heute';
  if (tag === tagPlus(heute, -1)) return 'Gestern';
  return TAG_LANG.format(new Date(`${tag}T12:00:00`));
}
