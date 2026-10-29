import { tagePlus } from '@/lib/datum';
import { RUECKWEG_PARAM, istInternerPfad } from '@/lib/rueckweg';
import { PLATTFORM_PFAD, bereichParameter } from './pfade';
import { fest } from './zeit';

/** Wege, Tage und Mengen des Ernährungstagebuchs - der Tag steht in der Adresse, nie ein Lebensmittel. */
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

/** Nur der gewählte Bereich - für Wege, die keine Herkunft mitnehmen. */
function mitBereich(pfad: string, suche: string): string {
  const bereich = bereichParameter(new URLSearchParams(suche));
  return bereich === '' ? pfad : `${pfad}?${bereich}`;
}

/** Der Tag im Tagebuch - `?tag=`, ohne Angabe heute; der Rückweg der Seite reist mit. */
export function tagebuchAdresse(tag: string | null, suche: string, heute?: string): string {
  return mitSuche(TAGEBUCH_PFAD, suche, {
    tag: tag === null || tag === heute ? null : tag,
    mahlzeit: null,
  });
}

/** Von der Ernährung ins Tagebuch, heute: Der Rückweg heißt dann „Ernährung“. */
export function tagebuchVonDerErnaehrung(suche: string): string {
  return mitBereich(TAGEBUCH_PFAD, suche);
}

/** Aus dem Tagebuch zur Ernährung, ohne Tag und ohne die Herkunft des Tagebuchs. */
export function ernaehrungAdresse(suche: string): string {
  return mitBereich(`${PLATTFORM_PFAD}/ernaehrung`, suche);
}

/**
 * Eintragen zu einer Mahlzeit an einem Tag. Der Rückweg ist der Tag samt dessen eigenem Rückweg,
 * damit das Tagebuch danach wieder „Übersicht“ oder „Ernährung“ sagt.
 */
export function eintragenAdresse(
  tag: string,
  mahlzeit: string,
  suche: string,
  heute?: string,
): string {
  return mitSuche(`${TAGEBUCH_PFAD}/eintragen`, suche, {
    tag,
    mahlzeit,
    [RUECKWEG_PARAM]: tagebuchAdresse(tag, suche, heute),
  });
}

/** Vom Eintragen zurück zum Tag: der Rückweg aus der Adresse, sonst der Tag ohne Herkunft. */
export function zurueckZumTag(suche: string, tag: string | null, heute?: string): string {
  const ziel = new URLSearchParams(suche).get(RUECKWEG_PARAM);
  if (istInternerPfad(ziel) && (ziel === TAGEBUCH_PFAD || ziel.startsWith(`${TAGEBUCH_PFAD}?`))) {
    return ziel;
  }
  return mitSuche(TAGEBUCH_PFAD, suche, {
    tag: tag === null || tag === heute ? null : tag,
    mahlzeit: null,
    [RUECKWEG_PARAM]: null,
  });
}

const TAG_LANG = new Intl.DateTimeFormat('de-DE', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});
const WOCHENTAG = new Intl.DateTimeFormat('de-DE', { weekday: 'long' });
const TAG_MONAT = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'long' });

/** „Heute“, „Gestern“, sonst „Freitag, 17. Oktober“. */
export function tagName(tag: string, heute: string): string {
  if (tag === heute) return 'Heute';
  if (tag === tagePlus(heute, -1)) return 'Gestern';
  return fest(TAG_LANG.format(new Date(`${tag}T12:00:00`)));
}

/**
 * Die zwei Zeilen der Tagesleiste: „Heute“ über „Donnerstag, 29. Oktober“, ebenso „Gestern“;
 * sonst der Wochentag über dem Datum. Tag und Monat brechen nicht auseinander.
 */
export function tagZeilen(tag: string, heute: string): { name: string; datum: string } {
  const d = new Date(`${tag}T12:00:00`);
  const datum = fest(TAG_MONAT.format(d));
  const name = tagName(tag, heute);
  if (name === 'Heute' || name === 'Gestern') {
    return { name, datum: `${WOCHENTAG.format(d)}, ${datum}` };
  }
  return { name: WOCHENTAG.format(d), datum };
}

/** Wasser in Litern mit bis zu zwei Stellen, ohne Einheit: „0,5“, „0,75“, „2“. */
export function literZahl(ml: number): string {
  return (ml / 1000).toLocaleString('de-DE', { maximumFractionDigits: 2, useGrouping: false });
}

/** Das Ziel in Litern wie unter „Ernährung“ (eine Stelle), die Einheit hängt am Wert. */
export function literZiel(ml: number): string {
  return `${(ml / 1000).toLocaleString('de-DE', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
    useGrouping: false,
  })}\u00a0l`;
}
