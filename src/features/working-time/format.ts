import { STATUSZEICHEN, type Ton } from '@/components/ui/Badge';
import { dateLong, isoWochentag } from '@/lib/datum';
import type { ChangeKind, RequestStatus } from './api';
import { WEEKDAYS, blocksText, hoursText, workMinutes, type Block, type Week } from './rules';

/** Die Wochentage, wie die Seite sie nennt. */
export const WEEKDAY_NAME: Record<(typeof WEEKDAYS)[number], string> = {
  '1': 'Montag',
  '2': 'Dienstag',
  '3': 'Mittwoch',
  '4': 'Donnerstag',
  '5': 'Freitag',
  '6': 'Samstag',
  '7': 'Sonntag',
};

/** Der ISO-Wochentag eines Kalendertags als Schlüssel: `'1'` Montag bis `'7'` Sonntag. */
export function isoWeekday(day: string): (typeof WEEKDAYS)[number] {
  return WEEKDAYS[isoWochentag(day) - 1]!;
}

/** Was ein Antrag ändert, als Titel: „Einmalig: Dienstag, 3. November“ oder „Ab Dienstag, 1. Dezember“. */
export function changeTitle(kind: ChangeKind, onDate: string): string {
  return kind === 'once' ? `Einmalig: ${dateLong(onDate)}` : `Wochenplan ab ${dateLong(onDate)}`;
}

/** „9:00 → 9:30 Std.“ - die Arbeitszeit bisher und neu. */
export function minutesChange(previous: number, next: number): string {
  return previous === next
    ? `${hoursText(next)}, gleich wie bisher`
    : `${hoursText(previous).replace(' Std.', '')} → ${hoursText(next)}`;
}

/** Ein Tag als „08:00–12:00, 13:00–18:00 · 9:00 Std.“. */
export function dayText(blocks: readonly Block[]): string {
  return blocks.length === 0 ? 'frei' : `${blocksText(blocks)} · ${hoursText(workMinutes(blocks))}`;
}

/** Die Wochentage, die sich zwischen zwei Wochen unterscheiden. */
export function changedWeekdays(previous: Week, next: Week): (typeof WEEKDAYS)[number][] {
  return WEEKDAYS.filter((day) => blocksText(previous[day] ?? []) !== blocksText(next[day] ?? []));
}

/** Wie beim Urlaub: „× Zurückgezogen“ bringt sein Zeichen mit (Design-Review Überholung 10). */
export function statusDisplay(status: RequestStatus): { text: string; ton: Ton; zeichen?: string } {
  switch (status) {
    case 'requested':
      return { text: 'Beantragt', ton: 'warnung' };
    case 'approved':
      return { text: 'Genehmigt', ton: 'positiv' };
    case 'rejected':
      return { text: 'Abgelehnt', ton: 'kritisch' };
    case 'withdrawn':
      return { text: 'Zurückgezogen', ton: 'neutral', zeichen: STATUSZEICHEN.abgelehnt };
  }
}
