import { mitRueckweg } from '@/lib/rueckweg';
import type { Bike } from './api';
import { formatTag, kalendertag, plusTage, wochentagVon } from './format';
import { freieLuecken, type Zeitband } from '@/lib/zeitband';

/**
 * Der Check-Up-Rhythmus (FLT-009, ANN-570) ohne Oberfläche: wann ein Rad
 * wieder dran ist und welche Lücke im Tag dafür passt.
 *
 * Kein fester Termin und kein Eintrag im Kalender - nur ein Hinweis. Die
 * Praxis legt den Rhythmus in Tagen fest (`organizations.
 * fleet_checkup_interval_days`); fällig ist ein Rad am Tag des letzten
 * Check-Ups plus Rhythmus, eines ohne Check-Up sofort. Ein gesperrtes Rad
 * steht in der Werkstatt und braucht keinen Hinweis.
 */

/** So lange dauert ein Check-Up mit Werbeflächen und Fotos, geschätzt (ANN-570). */
export const CHECKUP_DAUER_MINUTEN = 20;

/** Die Stufen der Einstellung; ein anderer gespeicherter Wert steht zusätzlich da. */
export const RHYTHMEN = [
  { tage: 7, text: 'Jede Woche' },
  { tage: 14, text: 'Alle 2 Wochen' },
  { tage: 21, text: 'Alle 3 Wochen' },
  { tage: 28, text: 'Alle 4 Wochen' },
] as const;

export function rhythmusText(tage: number | null): string {
  if (tage === null) return 'Aus';
  const stufe = RHYTHMEN.find((eintrag) => eintrag.tage === tage);
  return stufe ? stufe.text : tage === 1 ? 'Jeden Tag' : `Alle ${tage} Tage`;
}

export interface Faelligkeit {
  /** Ab diesem Tag fällig; `null`, wenn das Rad noch nie geprüft wurde. */
  ab: string | null;
}

/**
 * Wann ein Rad wieder einen Check-Up braucht - oder `null`, wenn kein
 * Hinweis gilt: Rhythmus aus, Rad gesperrt.
 */
export function faelligkeit(
  rad: Pick<Bike, 'last_checkup_at' | 'block'>,
  rhythmus: number | null,
  zone: string | null,
): Faelligkeit | null {
  if (rhythmus === null || rad.block) return null;
  if (!rad.last_checkup_at) return { ab: null };
  return { ab: plusTage(kalendertag(rad.last_checkup_at, zone), rhythmus) };
}

/** Ob ein Rad an einem Tag fällig ist (noch nie geprüft: immer). */
export function faelligAm(f: Faelligkeit | null, tag: string): boolean {
  return f !== null && (f.ab === null || f.ab <= tag);
}

/** „Check-Up fällig, noch nie geprüft“, „fällig seit 12.10.2026“, „fällig ab 20.10.2026“. */
export function faelligText(f: Faelligkeit, heute: string): string {
  if (f.ab === null) return 'Check-Up fällig, noch nie geprüft';
  const tag = formatTag(`${f.ab}T12:00:00Z`, 'UTC');
  if (f.ab === heute) return 'Check-Up heute fällig';
  return f.ab < heute ? `Check-Up fällig seit ${tag}` : `Check-Up fällig ab ${tag}`;
}

/**
 * Ob das Rad an diesem Wochentag im Einsatz ist: die geplanten Tage der
 * Stammnutzer:in; ohne geplante Tage jeder Tag.
 */
export function radImEinsatz(rad: Pick<Bike, 'planned_weekdays'>, tag: string): boolean {
  return rad.planned_weekdays.length === 0 || rad.planned_weekdays.includes(wochentagVon(tag));
}

/**
 * Die früheste freie Lücke für den Check-Up in der Arbeitszeit eines Tages,
 * ohne Termine zu berühren - am liebsten gleich zu Beginn, wenn das Rad am
 * Depot steht. `abMinute`: heute nichts, was schon vorbei ist. `null`, wenn
 * keine Lücke reicht oder die Arbeitszeit fehlt.
 */
export function checkupLuecke(
  baender: readonly Zeitband[] | null,
  belegt: readonly Zeitband[],
  abMinute = 0,
): Zeitband | null {
  if (!baender) return null;
  const vorbei = abMinute > 0 ? [{ vonMinute: 0, bisMinute: abMinute }] : [];
  const luecke = freieLuecken(baender, [...belegt, ...vorbei], CHECKUP_DAUER_MINUTEN)[0];
  return luecke
    ? { vonMinute: luecke.vonMinute, bisMinute: luecke.vonMinute + CHECKUP_DAUER_MINUTEN }
    : null;
}

/** Ein Tag im Kalender, wie ihn der Vorschlag braucht: Person, Arbeitszeit, Belegtes. */
export interface Tagesspalte {
  person: string;
  tag: string;
  baender: readonly Zeitband[] | null;
  belegt: readonly Zeitband[];
}

export interface Checkupvorschlag {
  rad: Bike;
  faellig: Faelligkeit;
  /** Tag und Zeit des Vorschlags, oder `null`, wenn im Ausschnitt nichts passt. */
  luecke: { person: string; tag: string; von: number; bis: number } | null;
}

/**
 * Die fälligen Räder der Personen im Ausschnitt, je mit der frühesten Lücke
 * an einem Einsatztag ab Fälligkeit (und ab heute). Ersatzräder ohne
 * Stammnutzer:in fehlen hier: Sie stehen nur in der Radflotte.
 */
export function checkupVorschlaege(eingabe: {
  raeder: readonly Bike[];
  rhythmus: number | null;
  zone: string | null;
  heute: string;
  jetztMinute: number | null;
  spalten: readonly Tagesspalte[];
}): Checkupvorschlag[] {
  const { raeder, rhythmus, zone, heute, jetztMinute, spalten } = eingabe;
  const vorschlaege: Checkupvorschlag[] = [];
  for (const rad of raeder) {
    const faellig = faelligkeit(rad, rhythmus, zone);
    const person = rad.regular_rider?.id;
    if (!faellig || !person) continue;
    const tage = spalten
      .filter(
        (spalte) =>
          spalte.person === person &&
          spalte.tag >= heute &&
          faelligAm(faellig, spalte.tag) &&
          radImEinsatz(rad, spalte.tag),
      )
      .sort((a, b) => a.tag.localeCompare(b.tag));
    // Nur, was im Ausschnitt fällig wird: ein Tag dieser Person ab Fälligkeit.
    if (!spalten.some((s) => s.person === person && s.tag >= heute && faelligAm(faellig, s.tag))) {
      continue;
    }
    let luecke: Checkupvorschlag['luecke'] = null;
    for (const spalte of tage) {
      const frei = checkupLuecke(
        spalte.baender,
        spalte.belegt,
        spalte.tag === heute ? (jetztMinute ?? 0) : 0,
      );
      if (frei) {
        luecke = { person, tag: spalte.tag, von: frei.vonMinute, bis: frei.bisMinute };
        break;
      }
    }
    vorschlaege.push({ rad, faellig, luecke });
  }
  return vorschlaege;
}

/** „07:40“ aus Minuten des Tages. */
export function uhrzeit(minuten: number): string {
  const h = Math.floor(minuten / 60);
  const m = minuten % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Der Weg ins Formular für die Fehlzeit, vorbelegt mit Tag, Zeit und Person.
 * Nur Kennungen und Uhrzeiten in der Adresse - den Titel setzt das Formular
 * aus `zweck` (`NewEventPage`), nie ein Rad- oder Personenname (ADR-011).
 */
export function eintragenPfad(
  luecke: { person: string; tag: string; von: number; bis: number },
  rueckweg: string,
): string {
  const suche = new URLSearchParams({
    datum: luecke.tag,
    beginn: uhrzeit(luecke.von),
    ende: uhrzeit(luecke.bis),
    person: luecke.person,
    zweck: 'checkup',
  });
  return mitRueckweg(`/termine/ereignis?${suche.toString()}`, rueckweg);
}
