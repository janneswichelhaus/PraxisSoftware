/**
 * Rechnen mit Arbeitszeiten (AZ-001, Überholung 8), ohne Oberfläche:
 * Arbeitsminuten, Pausen und die Grenzen des Arbeitszeitgesetzes.
 *
 * Ein Tag sind Blöcke `von`–`bis` in Ortszeit der Praxis (`HH:MM`); die
 * Pause ist die Lücke zwischen zwei Blöcken - so steht es im Wochenplan
 * (`staff_working_hours`). Verbindlich prüft der Server dieselben Regeln
 * (`app.working_day_problems`, `app.working_time_problems`); hier stehen sie,
 * damit die Seite vor dem Absenden sagt, was nicht geht.
 *
 * Grenzen (ANN-588): höchstens 10 Stunden Arbeit am Tag (§ 3 ArbZG), Pause von
 * mindestens 30 Minuten über 6 und 45 Minuten über 9 Stunden, eine Pause zählt
 * ab 15 Minuten, höchstens 6 Stunden am Stück (§ 4), 11 Stunden Ruhe bis zum
 * Beginn des nächsten Arbeitstags (§ 5). Keine Auswertung über Personen
 * (§ 20): Gerechnet wird nur der eigene Plan, gespeichert wird nichts davon.
 */

export interface Block {
  von: string;
  bis: string;
}

/** Ein Wochenplan: ISO-Wochentag `'1'` (Montag) bis `'7'` (Sonntag). */
export type Week = Record<string, Block[]>;

export const WEEKDAYS = ['1', '2', '3', '4', '5', '6', '7'] as const;

/**
 * Was gegen einen Tag spricht. Die vier gesetzlichen Gründe tragen dieselben
 * Kennungen wie am Server, damit Gerät und Server dieselben Sätze zeigen;
 * einen Freizeitausgleich am geänderten Wochentag kennt nur der Server
 * (ZK-001, ANN-595).
 */
export type Problem =
  | 'invalid_block'
  | 'overlap'
  | 'more_than_ten_hours'
  | 'break_too_short'
  | 'more_than_six_hours_in_a_row'
  | 'rest_shorter_than_eleven_hours'
  | 'time_off_in_lieu';

export const PROBLEM_TEXT: Record<Problem, string> = {
  invalid_block: 'Eine Zeit ist unvollständig oder endet vor ihrem Beginn.',
  overlap: 'Die Zeiten überschneiden sich.',
  more_than_ten_hours: 'Mehr als 10 Stunden Arbeit an einem Tag (§ 3 ArbZG).',
  break_too_short:
    'Die Pause ist zu kurz: über 6 Stunden 30, über 9 Stunden 45 Minuten (§ 4 ArbZG).',
  more_than_six_hours_in_a_row: 'Mehr als 6 Stunden am Stück ohne Pause (§ 4 ArbZG).',
  rest_shorter_than_eleven_hours:
    'Weniger als 11 Stunden Ruhe bis zum nächsten Arbeitstag (§ 5 ArbZG).',
  time_off_in_lieu:
    'An einem geänderten Wochentag steht ab dem Datum ein Freizeitausgleich – erst ihn zurücknehmen.',
};

export const LIMITS = {
  /** § 3 ArbZG: höchstens 10 Stunden am Tag. */
  dayMax: 10 * 60,
  /** § 4 ArbZG: über 6 Stunden 30 Minuten Pause, über 9 Stunden 45. */
  breakOverSix: 30,
  breakOverNine: 45,
  /** § 4 ArbZG: Pausen zählen ab 15 Minuten. */
  breakMin: 15,
  /** § 4 ArbZG: höchstens 6 Stunden am Stück. */
  inARowMax: 6 * 60,
  /** § 5 ArbZG: 11 Stunden Ruhe. */
  rest: 11 * 60,
} as const;

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** `HH:MM` als Minuten ab Mitternacht; `null` für eine ungültige Angabe. `24:00` ist das Ende des Tages. */
export function toMinutes(time: string): number | null {
  if (time === '24:00') return 24 * 60;
  const match = TIME.exec(time.slice(0, 5));
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/** Minuten als `HH:MM`. */
export function toTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function ordered(blocks: readonly Block[]): { von: number; bis: number }[] | null {
  const result: { von: number; bis: number }[] = [];
  for (const block of blocks) {
    const von = toMinutes(block.von);
    const bis = toMinutes(block.bis);
    if (von === null || bis === null || bis <= von) return null;
    result.push({ von, bis });
  }
  return result.sort((a, b) => a.von - b.von);
}

/** Die Blöcke sortiert nach Beginn - so, wie der Server sie speichert. */
export function sortBlocks(blocks: readonly Block[]): Block[] {
  return [...blocks].sort((a, b) => a.von.localeCompare(b.von));
}

/** Arbeitsminuten eines Tages: die Summe der Blöcke. */
export function workMinutes(blocks: readonly Block[]): number {
  return (ordered(blocks) ?? []).reduce((sum, b) => sum + (b.bis - b.von), 0);
}

/** Arbeitsminuten einer Woche. */
export function weekMinutes(week: Week): number {
  return WEEKDAYS.reduce((sum, day) => sum + workMinutes(week[day] ?? []), 0);
}

/** Die Pausen eines Tages: die Lücken zwischen den Blöcken, in Minuten. */
export function breaks(blocks: readonly Block[]): number[] {
  const day = ordered(blocks) ?? [];
  const gaps: number[] = [];
  for (let i = 1; i < day.length; i += 1) gaps.push(day[i]!.von - day[i - 1]!.bis);
  return gaps;
}

/** Was an einem Tag gegen die Regeln verstößt; leer, wenn nichts. */
export function dayProblems(blocks: readonly Block[]): Problem[] {
  if (blocks.length === 0) return [];
  const day = ordered(blocks);
  if (!day) return ['invalid_block'];
  for (let i = 1; i < day.length; i += 1) {
    if (day[i]!.von < day[i - 1]!.bis) return ['overlap'];
  }

  const found: Problem[] = [];
  const work = workMinutes(blocks);
  if (work > LIMITS.dayMax) found.push('more_than_ten_hours');
  const countingBreak = breaks(blocks)
    .filter((gap) => gap >= LIMITS.breakMin)
    .reduce((sum, gap) => sum + gap, 0);
  const needed = work > 9 * 60 ? LIMITS.breakOverNine : work > 6 * 60 ? LIMITS.breakOverSix : 0;
  if (countingBreak < needed) found.push('break_too_short');
  // Am Stück: Blöcke, zwischen denen keine zählende Pause liegt, gehören zusammen.
  let stretch = day[0]!.bis - day[0]!.von;
  let longest = stretch;
  for (let i = 1; i < day.length; i += 1) {
    const gap = day[i]!.von - day[i - 1]!.bis;
    const block = day[i]!.bis - day[i]!.von;
    stretch = gap >= LIMITS.breakMin ? block : stretch + gap + block;
    longest = Math.max(longest, stretch);
  }
  if (longest > LIMITS.inARowMax) found.push('more_than_six_hours_in_a_row');
  return found;
}

/**
 * Ruhe zwischen zwei aufeinanderfolgenden Arbeitstagen in Minuten: vom Ende
 * des einen bis zum Beginn des nächsten. `null`, wenn einer frei ist.
 */
export function restMinutes(day: readonly Block[], nextDay: readonly Block[]): number | null {
  const a = ordered(day);
  const b = ordered(nextDay);
  if (!a || !b || a.length === 0 || b.length === 0) return null;
  return 24 * 60 - a[a.length - 1]!.bis + b[0]!.von;
}

/** Was gegen eine Woche spricht: ihre Tage und die Ruhe von Tag zu Tag, auch Sonntag zu Montag. */
export function weekProblems(week: Week): Problem[] {
  const found = new Set<Problem>();
  WEEKDAYS.forEach((day, index) => {
    for (const problem of dayProblems(week[day] ?? [])) found.add(problem);
    const next = WEEKDAYS[(index + 1) % 7]!;
    const rest = restMinutes(week[day] ?? [], week[next] ?? []);
    if (rest !== null && rest < LIMITS.rest) found.add('rest_shorter_than_eleven_hours');
  });
  return [...found];
}

/** „9:00 Std.“ - Arbeitszeit lesbar. */
export function hoursText(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}:${String(m).padStart(2, '0')} Std.`;
}

/** „08:00–12:00, 13:00–18:00“; ein freier Tag ist „frei“. */
export function blocksText(blocks: readonly Block[]): string {
  if (blocks.length === 0) return 'frei';
  return sortBlocks(blocks)
    .map((b) => `${b.von}–${b.bis}`)
    .join(', ');
}

/** Ob zwei Tage dieselben Zeiten haben. */
export function sameBlocks(a: readonly Block[], b: readonly Block[]): boolean {
  return blocksText(a) === blocksText(b);
}
