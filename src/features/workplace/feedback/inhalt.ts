import type { BarometerAnswers, NamedFeedback } from './api';
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
