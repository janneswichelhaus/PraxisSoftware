import { tagePlus } from '@/features/appointments/calendar';
import { toMinutes, toTime, type Block } from '@/features/working-time/rules';

/**
 * Regeln des Zeitkontos am Gerät (ZK-001): dieselben Fristen wie am Server
 * (ANN-593, `app.time_account_check`), die Schnellwahl der Zeiten und der
 * Saldo als Text. Was zählt, rechnet der Server; die Seite rechnet vorher
 * nach, damit niemand erst nach dem Eintragen erfährt, was nicht geht.
 */

export type EntryKind = 'overtime' | 'time_off' | 'correction';
/** Im Konto steht dazu der Übertrag eines Jahres; ihn schreibt nur der Löschlauf (ANN-597). */
export type AccountEntryKind = EntryKind | 'carryover';

export const KIND_TITLE: Record<AccountEntryKind, string> = {
  overtime: 'Mehrarbeit',
  time_off: 'Freizeitausgleich',
  correction: 'Korrektur',
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
        ? 'Mehrarbeit lässt sich bis 31 Tage zurück eintragen, nicht im Voraus.'
        : kind === 'time_off'
          ? 'Freizeitausgleich geht bis 31 Tage zurück und höchstens ein Jahr voraus.'
          : 'Korrekturen gehen bis ein Jahr zurück, nicht im Voraus.';
    case 'times_invalid':
      return 'Bitte Beginn vor Ende angeben.';
    case 'overlaps_working_hours':
      // Der Grund, nicht eine Bestätigung (Praxis-Review Überholung 9).
      return 'Die Zeit liegt in der Arbeitszeit – Mehrarbeit nur davor oder danach.';
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
      return 'Bitte Stunden (nicht 0) und einen Grund angeben.';
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

/** Mehrarbeit ab Dienstende: viertel, halbe, ganze Stunden (Spezifikation G9). */
const OVERTIME_STEPS = [15, 30, 45, 60, 90, 120] as const;

export function overtimeChoices(blocks: readonly Block[]): TimeChoice[] {
  const end = dayEnd(blocks);
  if (end === null) return [];
  return OVERTIME_STEPS.filter((step) => end + step <= 24 * 60).map((step) => ({
    label: `+${Math.floor(step / 60)}:${String(step % 60).padStart(2, '0')}`,
    von: toTime(end),
    bis: toTime(end + step),
  }));
}

/**
 * Die Arbeitszeit des Tages nach einem Freizeitausgleich: die Blöcke des Plans
 * ohne die freie Zeit. „Tag umplanen“ wählt damit nur die Termine darin vor
 * (Praxis-Review Überholung 9).
 */
export function remainingBlocks(blocks: readonly Block[], von: string, bis: string): Block[] {
  const start = toMinutes(von);
  const end = toMinutes(bis);
  if (start === null || end === null) return [...blocks];
  return blocks.flatMap((block) => {
    const a = toMinutes(block.von);
    const b = toMinutes(block.bis);
    if (a === null || b === null || b <= start || end <= a) return [block];
    return [
      ...(a < start ? [{ von: block.von, bis: toTime(start) }] : []),
      ...(end < b ? [{ von: toTime(end), bis: block.bis }] : []),
    ];
  });
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

/**
 * Stunden einer Korrektur, wie man sie tippt: „12:30“, „-2“, „1,5“, „+0:45“.
 * Liefert Minuten oder `null`, wenn die Angabe nicht zu lesen ist.
 */
export function parseHours(input: string): number | null {
  let text = input.trim().replace('−', '-').replace(',', '.');
  let sign = 1;
  if (text.startsWith('-') || text.startsWith('+')) {
    if (text.startsWith('-')) sign = -1;
    text = text.slice(1);
  }
  const [whole = '', rest, extra] = text.includes(':') ? text.split(':') : text.split('.');
  if (extra !== undefined || !/^\d{1,4}$/.test(whole)) return null;
  let minutes = 0;
  if (rest !== undefined) {
    if (text.includes(':')) {
      if (!/^[0-5]\d$/.test(rest)) return null;
      minutes = Number(rest);
    } else {
      if (!/^\d{1,2}$/.test(rest)) return null;
      minutes = Math.round(Number(`0.${rest}`) * 60);
    }
  }
  const total = Number(whole) * 60 + minutes;
  if (total === 0 || total > 60000) return null;
  return sign * total;
}
