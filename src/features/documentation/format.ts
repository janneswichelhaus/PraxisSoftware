import { type Appointment } from '@/features/appointments/api';
import type { TreatmentNote } from './api';
import { formatLocalDate, formatLocalTime, formatLocalTimeRange, tagePlus } from '@/lib/datum';

/**
 * Der Zusatz am Etikett eines Entwurfs (DOK-02).
 *
 * Ein Entwurf bleibt nicht ewig einer: Mit Ablauf der Dokumentationsfrist der
 * Praxis wird er automatisch Version 1 (ADR-016 Punkt 7, ANN-008). Das
 * konkrete Fristende kennt die Oberfläche nicht - dafür bräuchte es ein
 * Serverfeld -, die Regel aber schon.
 */
export const ENTWURF_ZUSATZ = 'noch nicht finalisiert · wird automatisch finalisiert';

/**
 * Was sich an Eintrag oder Termin geändert hat, während die Seite offen war
 * (DOK-B01): eine Kollegin hat finalisiert, die Frist ist abgelaufen, das Büro
 * hat abgesagt oder „nicht angetroffen" vermerkt.
 */
export type Statuswechsel = 'finalisiert' | 'abgesagt' | 'nicht-angetroffen';

const STATUSWECHSEL: Record<Statuswechsel, string> = {
  finalisiert: 'Der Eintrag wurde inzwischen finalisiert',
  abgesagt: 'Der Termin wurde inzwischen abgesagt',
  'nicht-angetroffen': 'Der Termin wurde inzwischen als nicht angetroffen vermerkt',
};

/**
 * Die Warnung über dem Feld, wenn der Stand sich geändert hat (DOK-B01).
 *
 * Der Satz über den eigenen Text steht nur, wenn wirklich etwas Ungespeichertes
 * im Feld ist - sonst wäre er falsch.
 */
export function statuswechselText(wechsel: Statuswechsel, ungespeichert: boolean): string {
  return ungespeichert
    ? `${STATUSWECHSEL[wechsel]} – Ihr Text steht noch im Feld und ist nicht gespeichert.`
    : `${STATUSWECHSEL[wechsel]}.`;
}

/** Datum und Uhrzeit in der Praxiszeitzone, wie sie in der Dokumentation stehen. */
export function zeitpunkt(wert: string, zone: string): string {
  return `${formatLocalDate(wert, zone)}, ${formatLocalTime(wert, zone)} Uhr`;
}

/**
 * Die Herkunftszeile eines Eintrags.
 *
 * Für einen Entwurf zählt, wer ihn zuletzt geändert hat; für einen
 * finalisierten Eintrag, wer ihn zum Bestandteil der Akte gemacht hat. Beides
 * in einer Zeile zu zeigen wäre für den Alltag zu viel - die vollständige
 * Urheberschaft je Version steht im Änderungsverlauf.
 */
export function herkunft(note: TreatmentNote, zone: string): string {
  const verfasst = note.author_name ? `Verfasst von ${note.author_name}. ` : '';

  // Die automatische Finalisierung hat keine handelnde Person; das steht so
  // da, statt eine zu erfinden (DOK-004, ADR-016 Punkt 7).
  if (note.status === 'final' && note.finalized_at && note.finalisation_kind === 'automatic') {
    return `${verfasst}Automatisch finalisiert am ${zeitpunkt(note.finalized_at, zone)} nach Ablauf der Frist.${ohneVerbindung(note, zone)}`;
  }

  if (note.status === 'final' && note.finalized_at) {
    const wer = note.finalized_by_name ? ` von ${note.finalized_by_name}` : '';
    return `${verfasst}Finalisiert am ${zeitpunkt(note.finalized_at, zone)}${wer}.${ohneVerbindung(note, zone)}`;
  }

  const wer = note.last_editor_name ? ` von ${note.last_editor_name}` : '';
  return `${verfasst}Zuletzt geändert am ${zeitpunkt(note.updated_at, zone)}${wer}.${ohneVerbindung(note, zone)}`;
}

/**
 * Ohne Verbindung geschrieben (OFF-002, ADR-024 Punkt 8): die Uhr des Geräts
 * als Angabe, daneben der Eingang - so bleibt „zeitnah" nachvollziehbar
 * (§ 630f BGB), ohne dass die Angabe als geprüfte Zeit erscheint.
 */
function ohneVerbindung(note: TreatmentNote, zone: string): string {
  if (!note.reported_written_at) return '';
  return ` Ohne Verbindung geschrieben, laut Gerät am ${zeitpunkt(note.reported_written_at, zone)}; übertragen am ${zeitpunkt(note.created_at, zone)}.`;
}

/**
 * Bis wann ein Entwurf von selbst festgeschrieben wird, als „08.10."
 * (ADR-016 Punkt 7): der Behandlungstag in der Zeit der Praxis plus die Frist
 * der Praxis in Kalendertagen. Ohne geladene Frist kein Datum - lieber
 * nichts als ein falsches.
 */
export function fristDatum(
  startsAt: string,
  zone: string,
  tage: number | undefined,
  /**
   * Anlage des Entwurfs: Liegt sie später als die Behandlung, zählt sie
   * (ANN-008) - so beim übertragenen Offline-Entwurf, dessen Frist mit dem
   * Eingang beginnt (OFF-002, ADR-024 Punkt 6).
   */
  angelegtAm?: string,
): string | null {
  if (tage === undefined) return null;
  const tagVon = (wert: string) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: zone }).format(new Date(wert));
  const behandelt = tagVon(startsAt);
  const angelegt = angelegtAm ? tagVon(angelegtAm) : behandelt;
  const tag = angelegt > behandelt ? angelegt : behandelt;
  const [, monat, datum] = tagePlus(tag, tage).split('-');
  return `${datum}.${monat}.`;
}

/** „Mi 12.05.2027“ - Wochentag kurz, Datum mit Jahr, in der Zeit der Praxis. */
function kurzesDatum(iso: string, zone: string): string {
  const teile = new Intl.DateTimeFormat('de-DE', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: zone,
  }).formatToParts(new Date(iso));
  const wert = (art: Intl.DateTimeFormatPartTypes) =>
    teile.find((teil) => teil.type === art)?.value ?? '';
  return `${wert('weekday').replace('.', '')} ${wert('day')}.${wert('month')}.${wert('year')}`;
}

/**
 * Die Zeile unter dem Namen: „Nachtrag · Mi 12.05.2027 · 09:00–10:00“. Mit
 * Jahr, anders als auf der Schreibseite: Nachtrag, Korrektur und Verlauf
 * gelten oft einem Termin von früher.
 */
export function kopfzeileFuer(was: string, appointment: Appointment): string {
  const zone = appointment.organization_time_zone;
  return [
    was,
    kurzesDatum(appointment.starts_at, zone),
    formatLocalTimeRange(appointment.starts_at, appointment.ends_at, zone),
  ].join(' · ');
}
