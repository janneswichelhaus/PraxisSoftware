/**
 * Die acht Farben einer Person im Teamchat (TEAM-006, ANN-666) - Schlüssel,
 * Namen und Initialen. Die Werte stehen in `src/index.css`
 * (`--color-person-*`), die Reihenfolge der Vergabe in
 * `app.staff_color_palette()`.
 */

export const PERSONENFARBEN = [
  'tanne',
  'ozean',
  'pflaume',
  'moos',
  'veilchen',
  'petrol',
  'schiefer',
  'nacht',
] as const;
export type Personenfarbe = (typeof PERSONENFARBEN)[number];

export const PERSONENFARBE_NAMEN: Record<Personenfarbe, string> = {
  tanne: 'Tanne',
  ozean: 'Ozean',
  pflaume: 'Pflaume',
  moos: 'Moos',
  veilchen: 'Veilchen',
  petrol: 'Petrol',
  schiefer: 'Schiefer',
  nacht: 'Nacht',
};

export function istPersonenfarbe(wert: string): wert is Personenfarbe {
  return (PERSONENFARBEN as readonly string[]).includes(wert);
}

/** „Anna Beispiel“ → „AB“, „Tom“ → „T“; erster und letzter Teil des Namens. */
export function initialen(name: string | null | undefined): string {
  const teile = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (teile.length === 0) return '?';
  const erste = Array.from(teile[0]!)[0] ?? '';
  const letzte = teile.length > 1 ? (Array.from(teile.at(-1)!)[0] ?? '') : '';
  return `${erste}${letzte}`.toLocaleUpperCase('de-DE');
}
