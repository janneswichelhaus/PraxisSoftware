import { LIMITS, sortBlocks, toMinutes, toTime, workMinutes, type Block } from './rules';

/**
 * Ein Tag im Formular des Antrags (ANN-592), ohne Oberfläche: Beginn, Ende
 * und - wenn es sie gibt - die Pause mit Lage und Dauer. Gespeichert wird ein
 * Tag weiter als Blöcke (`staff_working_hours`); das Formular übersetzt nur.
 *
 *   * Ein Tag ohne Blöcke ist frei (Beginn und Ende leer).
 *   * Ein Block: Beginn und Ende, keine Pause.
 *   * Zwei Blöcke: die Lücke dazwischen ist die Pause - verschiebbar und in
 *     der Dauer änderbar.
 *   * Mehr als zwei Blöcke bildet das Formular nicht ab; der Tag bleibt dann,
 *     wie er ist (`formFromBlocks` liefert `null`).
 *
 * Eine Pause einfügen geht erst, wenn der Tag sie braucht (über 6 Stunden am
 * Stück, § 4 ArbZG). Wird die Arbeitszeit durch eine längere Pause kürzer als
 * bisher, schlägt `suggestedEnd` das spätere Ende vor - übernommen wird es
 * nur auf Tipp.
 */
export interface DayForm {
  start: string;
  end: string;
  breakStart: string | null;
  breakMinutes: number | null;
}

/** Wie lang eine Pause sein kann - in Viertelstunden. */
export const BREAK_CHOICES = [15, 30, 45, 60, 75, 90, 105, 120] as const;

export const FREE_DAY: DayForm = { start: '', end: '', breakStart: null, breakMinutes: null };

export function formFromBlocks(blocks: readonly Block[]): DayForm | null {
  const sorted = sortBlocks(blocks);
  if (sorted.length === 0) return { ...FREE_DAY };
  if (sorted.length === 1) {
    return { start: sorted[0]!.von, end: sorted[0]!.bis, breakStart: null, breakMinutes: null };
  }
  if (sorted.length > 2) return null;
  const first = sorted[0]!;
  const second = sorted[1]!;
  const gap = (toMinutes(second.von) ?? 0) - (toMinutes(first.bis) ?? 0);
  return { start: first.von, end: second.bis, breakStart: first.bis, breakMinutes: gap };
}

/** Blöcke aus dem Formular; `null`, solange etwas fehlt oder nicht zusammenpasst. */
export function blocksFromForm(form: DayForm): Block[] | null {
  if (form.start === '' && form.end === '') return form.breakStart === null ? [] : null;
  const start = toMinutes(form.start);
  const end = toMinutes(form.end);
  if (start === null || end === null || end <= start) return null;
  if (form.breakStart === null) return [{ von: form.start, bis: form.end }];
  const breakStart = toMinutes(form.breakStart);
  const minutes = form.breakMinutes;
  if (breakStart === null || minutes === null || minutes <= 0) return null;
  const breakEnd = breakStart + minutes;
  if (breakStart <= start || breakEnd >= end) return null;
  return [
    { von: form.start, bis: toTime(breakStart) },
    { von: toTime(breakEnd), bis: form.end },
  ];
}

/** Ob der Tag eine Pause braucht, die er nicht hat: über 6 Stunden am Stück. */
export function needsBreak(form: DayForm): boolean {
  if (form.breakStart !== null) return false;
  const blocks = blocksFromForm(form);
  return blocks !== null && workMinutes(blocks) > LIMITS.inARowMax;
}

/**
 * Eine Pause einfügen: so lang, wie das Gesetz sie für den Tag verlangt, etwa
 * in der Mitte (auf die Viertelstunde). Das Ende bleibt; ob es sich nach
 * hinten schieben soll, schlägt `suggestedEnd` vor.
 */
export function withBreak(form: DayForm): DayForm {
  const start = toMinutes(form.start);
  const end = toMinutes(form.end);
  if (start === null || end === null || end <= start) return form;
  const span = end - start;
  const minutes = span - LIMITS.breakOverSix > 9 * 60 ? LIMITS.breakOverNine : LIMITS.breakOverSix;
  const middle = start + Math.round((span - minutes) / 2 / 15) * 15;
  return { ...form, breakStart: toTime(middle), breakMinutes: minutes };
}

/** Die Pause wieder entfernen: ein Block von Beginn bis Ende. */
export function withoutBreak(form: DayForm): DayForm {
  return { ...form, breakStart: null, breakMinutes: null };
}

/**
 * Das Ende, mit dem die Arbeitszeit des Tages bleibt, wenn sie durch die
 * Pause kürzer geworden ist als bisher; sonst `null`.
 */
export function suggestedEnd(form: DayForm, previousMinutes: number): string | null {
  const blocks = blocksFromForm(form);
  if (!blocks || blocks.length === 0) return null;
  const missing = previousMinutes - workMinutes(blocks);
  if (missing <= 0) return null;
  const end = (toMinutes(form.end) ?? 0) + missing;
  if (end > 24 * 60) return null;
  return toTime(end);
}
