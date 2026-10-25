import { toMinutes, toTime, type Block } from '@/features/working-time/rules';
import { tagePlus } from '@/lib/datum';

/**
 * Regeln des Zeitkontos am Gerät (ZK-001): dieselben Fristen wie am Server
 * (ANN-593, `app.time_account_check`), die Vorschläge der Zeiten und der
 * Saldo als Text. In der Oberfläche heißen `overtime` „Überstunden“ und
 * `correction` „Minusstunden“ (ORG-007, ANN-606); die Kennungen bleiben. Was zählt, rechnet der Server; die Seite rechnet vorher
 * nach, damit niemand erst nach dem Eintragen erfährt, was nicht geht.
 */

export type EntryKind = 'overtime' | 'time_off' | 'correction';
/** Im Konto steht dazu der Übertrag eines Jahres; ihn schreibt nur der Löschlauf (ANN-597). */
export type AccountEntryKind = EntryKind | 'carryover';

export const KIND_TITLE: Record<AccountEntryKind, string> = {
  overtime: 'Überstunden',
  time_off: 'Freizeitausgleich',
  correction: 'Minusstunden',
  carryover: 'Übertrag',
};

/** Wie weit zurück und voraus ein Eintrag reicht, in Tagen (ANN-593). */
export const WINDOW = {
  overtime: { back: 31, ahead: 0 },
  time_off: { back: 31, ahead: 365 },
  correction: { back: 366, ahead: 0 },
} as const satisfies Record<EntryKind, { back: number; ahead: number }>;

/** Der erste und der letzte Tag, den eine Art zulässt. */
export function dateWindow(kind: EntryKind, today: string): { from: string; to: string } {
  return { from: tagePlus(today, -WINDOW[kind].back), to: tagePlus(today, WINDOW[kind].ahead) };
}

export const PROBLEMS = [
  'date_out_of_range',
  'times_invalid',
  'overlaps_working_hours',
  'leave',
  'absent',
  'changed_day',
  'no_working_time',
  'outside_working_hours',
  'overlaps_entry',
  'correction_invalid',
] as const;
export type Problem = (typeof PROBLEMS)[number];

/** Die Gründe des Servers in Sätzen der Praxis. */
export function problemText(problem: Problem, kind: EntryKind): string {
  switch (problem) {
    case 'date_out_of_range':
      return kind === 'overtime'
        ? 'Überstunden lassen sich bis 31 Tage zurück eintragen, nicht im Voraus.'
        : kind === 'time_off'
          ? 'Freizeitausgleich geht bis 31 Tage zurück und höchstens ein Jahr voraus.'
          : 'Minusstunden gehen bis ein Jahr zurück, nicht im Voraus.';
    case 'times_invalid':
      return 'Bitte Beginn vor Ende angeben.';
    case 'overlaps_working_hours':
      // Der Grund, nicht eine Bestätigung (Praxis-Review Überholung 9).
      return 'Die Zeit liegt in der Arbeitszeit – Überstunden nur davor oder danach.';
    case 'leave':
      return 'An diesem Tag ist Urlaub.';
    case 'absent':
      return 'An diesem Tag ist eine Abwesenheit eingetragen.';
    case 'changed_day':
      return 'An diesem Tag gelten schon geänderte Zeiten.';
    case 'no_working_time':
      return 'An diesem Tag ist keine Arbeitszeit.';
    case 'outside_working_hours':
      return 'Freizeitausgleich nur innerhalb der Arbeitszeit.';
    case 'overlaps_entry':
      return 'In dieser Zeit steht schon ein Eintrag.';
    case 'correction_invalid':
      // Minusstunden ziehen nur ab (ANN-606).
      return 'Minusstunden ziehen nur ab – bitte eine Dauer und einen Grund angeben.';
  }
}

export function isProblem(code: string): code is Problem {
  return (PROBLEMS as readonly string[]).includes(code);
}

/** „+2:15 Std.“, „−1:30 Std.“, „0:00 Std.“ - der Saldo und jeder Eintrag. */
export function signedHours(minutes: number): string {
  const sign = minutes > 0 ? '+' : minutes < 0 ? '−' : '';
  const value = Math.abs(minutes);
  return `${sign}${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}\u00a0Std.`;
}

export interface TimeChoice {
  label: string;
  von: string;
  bis: string;
}

/** Ende des Tages nach Plan; `null` an einem freien Tag. */
function dayEnd(blocks: readonly Block[]): number | null {
  const ends = blocks.map((b) => toMinutes(b.bis)).filter((m): m is number => m !== null);
  return ends.length > 0 ? Math.max(...ends) : null;
}

function dayStart(blocks: readonly Block[]): number | null {
  const starts = blocks.map((b) => toMinutes(b.von)).filter((m): m is number => m !== null);
  return starts.length > 0 ? Math.min(...starts) : null;
}

/**
 * Überstunden beginnen vorbelegt am Dienstende des Tages laut Plan (wie die
 * frühere Schnellwahl „ab Dienstende“); an einem freien Tag um 08:00. Der
 * Beginn bleibt änderbar, die Dauer stellt der Regler (ANN-606).
 */
export const FREE_DAY_START = '08:00';

export function overtimeStart(blocks: readonly Block[]): string {
  const end = dayEnd(blocks);
  return end === null ? FREE_DAY_START : toTime(end);
}

/** Überstunden am Regler: 30 Minuten vorgestellt, höchstens 6 Stunden. */
export const OVERTIME_DEFAULT = 30;
export const OVERTIME_MAX = 6 * 60;

/**
 * Das Höchste am Regler ab `von`: sechs Stunden, aber nicht über Mitternacht -
 * ein Eintrag liegt an einem Tag (`app.time_account_check`). Was das
 * Arbeitszeitgesetz sonst verlangt, prüft der Server nicht und der Regler
 * auch nicht.
 */
export function overtimeMax(von: string): number {
  const start = toMinutes(von);
  if (start === null) return OVERTIME_MAX;
  return Math.max(5, Math.min(OVERTIME_MAX, 24 * 60 - start));
}

/** Das Ende von Überstunden: Beginn plus Dauer; leer ohne lesbaren Beginn. */
export function overtimeEnd(von: string, minutes: number): string {
  const start = toMinutes(von);
  return start === null ? '' : toTime(start + minutes);
}

/** Minusstunden am Regler: 30 Minuten vorgestellt, höchstens 10 Stunden. */
export const CORRECTION_DEFAULT = 30;
export const CORRECTION_MAX = 10 * 60;

/**
 * Wo Termine an einem Tag mit Freizeitausgleich bleiben können: alles außer
 * der freien Zeit. „Tag umplanen“ wählt damit genau die Termine darin vor -
 * wie der Server sie zählt -, keinen in der Mittagspause oder vor Dienstbeginn
 * (Praxis-Review Überholung 9, Runde 2).
 */
export function outsideWindow(von: string, bis: string): Block[] {
  return [
    ...(von > '00:00' ? [{ von: '00:00', bis: von }] : []),
    ...(bis < '23:59' ? [{ von: bis, bis: '23:59' }] : []),
  ];
}

/** Freizeitausgleich am Plan des Tages: früher gehen, später kommen, ganzer Tag. */
export function timeOffChoices(blocks: readonly Block[]): TimeChoice[] {
  const start = dayStart(blocks);
  const end = dayEnd(blocks);
  if (start === null || end === null) return [];
  const choices: TimeChoice[] = [];
  for (const hours of [1, 2]) {
    if (end - hours * 60 > start) {
      choices.push({
        label: `${hours} Std. früher gehen`,
        von: toTime(end - hours * 60),
        bis: toTime(end),
      });
    }
  }
  if (start + 60 < end) {
    choices.push({ label: '1 Std. später kommen', von: toTime(start), bis: toTime(start + 60) });
  }
  choices.push({ label: 'Ganzer Tag', von: toTime(start), bis: toTime(end) });
  return choices;
}
