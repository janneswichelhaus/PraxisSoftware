/**
 * Die Kopfzeile der Tour am Handy (Runde 3, Handoff Kalender und Tour
 * 2026-10-06): statt drei gestapelter Felder eine Zeile „Name · Di, 06.10."
 * und darunter, wo die Tour beginnt und endet.
 */
export type Ortswahl = 'garage' | 'standort' | 'besuch';

const TAG_KURZ = new Intl.DateTimeFormat('de-DE', {
  weekday: 'short',
  day: '2-digit',
  month: '2-digit',
  timeZone: 'UTC',
});

/** „Di, 06.10." - der Punkt nach dem Wochentag entfällt wie im Kalenderkopf. */
export function tagKurz(tag: string): string {
  const teile = TAG_KURZ.formatToParts(new Date(`${tag}T12:00:00Z`));
  const wert = (art: Intl.DateTimeFormatPartTypes) =>
    teile.find((teil) => teil.type === art)?.value ?? '';
  return `${wert('weekday').replace('.', '')}, ${wert('day')}.${wert('month')}.`;
}

function ortName(art: Ortswahl, rolle: 'start' | 'ende'): string {
  if (art === 'garage') return 'Garage';
  if (art === 'standort') return 'Praxis';
  return rolle === 'start' ? 'erster Besuch' : 'letzter Besuch';
}

/** „Start und Ende: Praxis" oder „Start: Garage · Ende: letzter Besuch". */
export function ortsZeile(start: Ortswahl, ende: Ortswahl): string {
  if (start === ende && start !== 'besuch') return `Start und Ende: ${ortName(start, 'start')}`;
  return `Start: ${ortName(start, 'start')} · Ende: ${ortName(ende, 'ende')}`;
}
