/**
 * Rhythmus einer Terminserie (CAL-007).
 *
 * Reine Rechnung auf Kalendertagen, ohne Zeitzone und ohne Zufall: dieselbe
 * Eingabe ergibt immer dieselben Tage (`PROJECT_PRINCIPLES.md` §6.2). Die
 * Datei spricht bewusst mit keinem Server - was aus den Tagen wird, entscheidet
 * `create_appointment_series`, und die Konflikte meldet
 * `check_appointment_slots`.
 *
 * Die Rhythmen sind eine **Annahme** (ANN-038), keine Vorgabe aus einem
 * Prinzip oder ADR: Sie decken die Frequenzen ab, die auf den Verordnungen
 * dieser Praxis stehen („1x pro Woche", „2x pro Woche"). Ein freier Abstand in
 * Tagen wäre allgemeiner und im Alltag unbequemer; wer einen einzelnen Termin
 * anders legen will, verschiebt ihn in der Liste.
 */

export interface Serientermin {
  datum: string;
  beginn: string;
}

export type Rhythmus = 'woechentlich' | 'zweimal_woechentlich' | 'zweiwoechentlich';

/**
 * Abstände in Tagen, im Wechsel angewendet.
 *
 * „Zweimal pro Woche" ist bewusst 3 und 4 im Wechsel und nicht zweimal 3,5:
 * So bleibt die Serie auf denselben zwei Wochentagen (Montag → Donnerstag →
 * Montag), und genau so steht sie im Terminkalender der Praxis.
 */
export const rhythmen: Record<Rhythmus, { label: string; abstaende: number[] }> = {
  woechentlich: { label: 'Einmal pro Woche', abstaende: [7] },
  zweimal_woechentlich: { label: 'Zweimal pro Woche', abstaende: [3, 4] },
  zweiwoechentlich: { label: 'Alle zwei Wochen', abstaende: [14] },
};

/**
 * Höchstzahl der Termine je Serienvorgang.
 *
 * Muss mit `app.appointment_series_limit()` übereinstimmen; ein Datenbanktest
 * hält beide gegeneinander. Dreißig sind rund ein halbes Jahr bei zwei
 * Behandlungen je Woche (ANN-038).
 */
export const SERIE_HOECHSTZAHL = 30;

/**
 * Verschiebt einen Kalendertag um ganze Tage.
 *
 * UTC-verankert, damit daraus nie eine Ortszeit abgeleitet wird - dieselbe
 * Regel wie in `calendar.ts` und in `folgeterminVorbelegung`.
 */
function tagePlus(iso: string, tage: number): string {
  const tag = new Date(`${iso}T00:00:00Z`);
  tag.setUTCDate(tag.getUTCDate() + tage);
  return tag.toISOString().slice(0, 10);
}

const ISO_TAG = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Die Termine einer Serie: erster Tag, dann der Rhythmus.
 *
 * Alle Termine beginnen zur selben Uhrzeit — abweichen kann man einzeln, und
 * zwar in der Liste, nicht in dieser Rechnung.
 */
export function serienTermine(
  ersterTag: string,
  beginn: string,
  rhythmus: Rhythmus,
  anzahl: number,
): Serientermin[] {
  if (!ISO_TAG.test(ersterTag) || anzahl < 1) return [];

  const { abstaende } = rhythmen[rhythmus];
  const termine: Serientermin[] = [];
  let tag = ersterTag;

  for (let i = 0; i < Math.min(anzahl, SERIE_HOECHSTZAHL); i += 1) {
    if (i > 0) tag = tagePlus(tag, abstaende[(i - 1) % abstaende.length]!);
    termine.push({ datum: tag, beginn });
  }

  return termine;
}
