/**
 * Gesetzliche Feiertage der Bundesländer, in denen die Praxis arbeitet
 * (Überholung 7, ANN-577): Baden-Württemberg (Tübingen) und
 * Nordrhein-Westfalen (Köln). Urlaubstage zählen nur Arbeitstage, die kein
 * Feiertag sind (§ 3 BUrlG: Werktage ohne gesetzliche Feiertage).
 *
 * Dieselbe Rechnung steht am Server (`app.is_public_holiday`), der die Tage
 * eines Antrags verbindlich zählt; `supabase/tests/staff-leave.test.ts` hält
 * beide auf denselben Daten. Kein externer Dienst: feste Tage plus der
 * Abstand zu Ostern (Gaußsche Osterformel), Quellen FeiertG NRW § 2 und das
 * Innenministerium Baden-Württemberg.
 */

export type Bundesland = 'BW' | 'NW';

export const BUNDESLAND_NAME: Record<Bundesland, string> = {
  BW: 'Baden-Württemberg',
  NW: 'Nordrhein-Westfalen',
};

/** Ostersonntag eines Jahres als `YYYY-MM-DD` (gregorianisch, Meeus/Jones/Butcher). */
export function ostersonntag(jahr: number): string {
  const a = jahr % 19;
  const b = Math.floor(jahr / 100);
  const c = jahr % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const monat = Math.floor((h + l - 7 * m + 114) / 31);
  const tag = ((h + l - 7 * m + 114) % 31) + 1;
  return `${jahr}-${String(monat).padStart(2, '0')}-${String(tag).padStart(2, '0')}`;
}

function plusTage(tag: string, tage: number): string {
  const d = new Date(`${tag}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + tage);
  return d.toISOString().slice(0, 10);
}

/** Die gesetzlichen Feiertage eines Jahres mit Namen, nach Datum. */
export function feiertage(jahr: number, land: Bundesland): { tag: string; name: string }[] {
  const ostern = ostersonntag(jahr);
  const j = String(jahr);
  const liste: { tag: string; name: string }[] = [
    { tag: `${j}-01-01`, name: 'Neujahr' },
    ...(land === 'BW' ? [{ tag: `${j}-01-06`, name: 'Heilige Drei Könige' }] : []),
    { tag: plusTage(ostern, -2), name: 'Karfreitag' },
    { tag: plusTage(ostern, 1), name: 'Ostermontag' },
    { tag: `${j}-05-01`, name: 'Tag der Arbeit' },
    { tag: plusTage(ostern, 39), name: 'Christi Himmelfahrt' },
    { tag: plusTage(ostern, 50), name: 'Pfingstmontag' },
    { tag: plusTage(ostern, 60), name: 'Fronleichnam' },
    { tag: `${j}-10-03`, name: 'Tag der Deutschen Einheit' },
    { tag: `${j}-11-01`, name: 'Allerheiligen' },
    { tag: `${j}-12-25`, name: '1. Weihnachtstag' },
    { tag: `${j}-12-26`, name: '2. Weihnachtstag' },
  ];
  return liste.sort((x, y) => x.tag.localeCompare(y.tag));
}

/** Der Name des Feiertags an einem Tag, sonst `null`. */
export function feiertag(tag: string, land: Bundesland): string | null {
  const jahr = Number(tag.slice(0, 4));
  return feiertage(jahr, land).find((eintrag) => eintrag.tag === tag)?.name ?? null;
}

/** Die Feiertage von `von` bis `bis` (einschließlich), nach Datum. */
export function feiertageZwischen(
  von: string,
  bis: string,
  land: Bundesland,
): { tag: string; name: string }[] {
  const jahre: number[] = [];
  for (let jahr = Number(von.slice(0, 4)); jahr <= Number(bis.slice(0, 4)); jahr += 1) {
    jahre.push(jahr);
  }
  return jahre
    .flatMap((jahr) => feiertage(jahr, land))
    .filter((eintrag) => von <= eintrag.tag && eintrag.tag <= bis);
}
