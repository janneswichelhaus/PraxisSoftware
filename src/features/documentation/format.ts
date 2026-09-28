import { formatLocalDate, formatLocalTime } from '@/features/appointments/api';
import type { TreatmentNote } from './api';

/**
 * Klassen für klinischen Freitext, wo er gelesen wird (DOK-23).
 *
 * `whitespace-pre-wrap` hält die Absätze, wie sie getippt wurden. Es bricht
 * aber nur an Leerraum um: Ein kopierter Link, eine Messreihe wie
 * „Flex/Ext/Abd:120/0/10°“ oder ein langes Kompositum schöbe die Karte bei
 * 390 px waagerecht auf. `wrap-anywhere` bricht solche Ketten notfalls mitten
 * im Wort - wie `DetailRow` und das Bausteinfeld es schon tun.
 */
export const FREITEXT = 'whitespace-pre-wrap wrap-anywhere';

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
    return `${verfasst}Automatisch finalisiert am ${zeitpunkt(note.finalized_at, zone)} nach Ablauf der Frist.`;
  }

  if (note.status === 'final' && note.finalized_at) {
    const wer = note.finalized_by_name ? ` von ${note.finalized_by_name}` : '';
    return `${verfasst}Finalisiert am ${zeitpunkt(note.finalized_at, zone)}${wer}.`;
  }

  const wer = note.last_editor_name ? ` von ${note.last_editor_name}` : '';
  return `${verfasst}Zuletzt geändert am ${zeitpunkt(note.updated_at, zone)}${wer}.`;
}
