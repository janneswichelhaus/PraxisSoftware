import type { BarometerAnswers, NamedFeedback, ScaleSummary } from './api';
import { SKALEN, TEXTE } from './fragen';

/** Wege der Rückmeldungen (ORG-006); unter dem Reiter Eingang. */
export const BAROMETER_PFAD = '/betrieb/barometer';
export const RUECKMELDUNG_PFAD = '/betrieb/rueckmeldung';

/** „7 von 9“ oder „übersprungen“. */
export function skalenText(wert: number | null): string {
  return wert === null ? 'übersprungen' : `${wert} von 9`;
}

/** Ob im Barometer überhaupt etwas beantwortet ist - sonst gibt es nichts zu senden. */
export function etwasBeantwortet(antworten: BarometerAnswers): boolean {
  return (
    antworten.mood !== null ||
    antworten.tours !== null ||
    antworten.team !== null ||
    antworten.easier.trim() !== '' ||
    antworten.more.trim() !== ''
  );
}

/** Ein Median mit Komma, ohne „,0“: „6“, „6,5“. */
export function medianText(median: number): string {
  return Number.isInteger(median) ? String(median) : median.toFixed(1).replace('.', ',');
}

/**
 * Die Verteilung einer Skala in drei Gruppen: niedrig (1–3), mittel (4–6),
 * hoch (7–9). Neun einzelne Zahlen läsen sich am Telefon schlecht; die Summe
 * bleibt dieselbe.
 */
export function verteilungText(verteilung: readonly number[]): string {
  const summe = (von: number, bis: number) => verteilung.slice(von, bis).reduce((a, b) => a + b, 0);
  return `niedrig ${summe(0, 3)} · mittel ${summe(3, 6)} · hoch ${summe(6, 9)}`;
}

/** Eine Zeile je Skala der Auswertung. */
export function skalenSumme(skala: ScaleSummary): string {
  if (!skala.enough) return 'Zu wenige Antworten auf diese Frage';
  return `Median ${medianText(skala.median)} von 9 · ${verteilungText(skala.distribution)}`;
}

/** Die Werte einer namentlichen Barometer-Antwort in einer Zeile: „Insgesamt 7 · Touren und Fahrzeiten – · …“. */
export function skalenZeile(eintrag: Pick<NamedFeedback, 'mood' | 'tours' | 'team'>): string {
  return SKALEN.map(({ schluessel, kurz }) => {
    const wert = eintrag[schluessel];
    return `${kurz} ${wert === null ? '–' : wert}`;
  }).join(' · ');
}

/** Die Freitexte einer namentlichen Barometer-Antwort mit ihrer Frage. */
export function textZeilen(
  eintrag: Pick<NamedFeedback, 'easier_text' | 'more_text'>,
): { kurz: string; text: string }[] {
  const texte = { easier: eintrag.easier_text, more: eintrag.more_text };
  return TEXTE.flatMap(({ schluessel, kurz }) => {
    const text = texte[schluessel];
    return text ? [{ kurz, text }] : [];
  });
}
