import { WOCHENTAGE, type Wochentag, type Zeitblock } from '@/lib/datum';

/**
 * Wochenpläne zum Einrichten einer neuen Kolleg:in (Überholung 6, G5) -
 * **Startinhalt**, kein Datenmodell: drei Vorlagen, aus denen ein Tipp den
 * Wochenplan setzt. Gespeichert wird wie in der Planung, je Wochentag über
 * `saveWorkingHours` mit Blöcken `HH:MM` in Ortszeit der Praxis; danach ist es
 * ein gewöhnlicher Wochenplan, den die Planung ändert.
 *
 * Die Zeiten sind Vorschläge (Spec Überholung 6, „Startinhalte“). Wer sie für
 * die Praxis anders braucht, ändert sie hier - eine Stelle, kein Schema.
 */
export type VorlageKey = 'vollzeit' | 'teilzeit-vormittags' | 'teilzeit-drei-tage';

export interface Arbeitszeitvorlage {
  key: VorlageKey;
  /** Der Name der Zeile, etwa „Vollzeit“. */
  titel: string;
  /** Die Arbeitstage mit ihren Blöcken; fehlende Tage sind frei. */
  tage: Partial<Record<Wochentag, readonly Zeitblock[]>>;
}

const GANZER_TAG: readonly Zeitblock[] = [
  { von: '08:00', bis: '12:30' },
  { von: '13:00', bis: '16:30' },
];
const VORMITTAG: readonly Zeitblock[] = [{ von: '08:00', bis: '12:00' }];

export const ARBEITSZEITVORLAGEN: readonly Arbeitszeitvorlage[] = [
  {
    key: 'vollzeit',
    titel: 'Vollzeit',
    tage: { 1: GANZER_TAG, 2: GANZER_TAG, 3: GANZER_TAG, 4: GANZER_TAG, 5: GANZER_TAG },
  },
  {
    key: 'teilzeit-vormittags',
    titel: 'Teilzeit vormittags',
    tage: { 1: VORMITTAG, 2: VORMITTAG, 3: VORMITTAG, 4: VORMITTAG, 5: VORMITTAG },
  },
  {
    key: 'teilzeit-drei-tage',
    titel: 'Teilzeit drei Tage',
    tage: { 1: GANZER_TAG, 3: GANZER_TAG, 4: GANZER_TAG },
  },
];

export function vorlageZu(key: VorlageKey): Arbeitszeitvorlage {
  return ARBEITSZEITVORLAGEN.find((vorlage) => vorlage.key === key)!;
}

/** Die Arbeitstage einer Vorlage in ihrer Reihenfolge, so wie sie gespeichert werden. */
export function wochenplanDer(vorlage: Arbeitszeitvorlage): [Wochentag, Zeitblock[]][] {
  return WOCHENTAGE.flatMap((tag): [Wochentag, Zeitblock[]][] => {
    const bloecke = vorlage.tage[tag];
    return bloecke ? [[tag, [...bloecke]]] : [];
  });
}

const KURZ: Record<Wochentag, string> = {
  1: 'Mo',
  2: 'Di',
  3: 'Mi',
  4: 'Do',
  5: 'Fr',
  6: 'Sa',
  7: 'So',
};

/** „8:00“ statt „08:00“ - so, wie man eine Uhrzeit sagt. */
function uhrzeit(wert: string): string {
  return wert.replace(/^0(\d)/, '$1');
}

/** „Mo–Fr“ für drei und mehr Tage am Stück, sonst „Mo, Mi, Do“. */
function tageText(tage: readonly Wochentag[]): string {
  const laeufe: Wochentag[][] = [];
  for (const tag of tage) {
    const letzter = laeufe.at(-1);
    if (letzter && letzter.at(-1) === tag - 1) letzter.push(tag);
    else laeufe.push([tag]);
  }
  return laeufe
    .flatMap((lauf) =>
      lauf.length >= 3 ? [`${KURZ[lauf[0]!]}–${KURZ[lauf.at(-1)!]}`] : lauf.map((tag) => KURZ[tag]),
    )
    .join(', ');
}

/**
 * Die Vorlage in einer Zeile, etwa „Mo–Fr 8:00–12:30 und 13:00–16:30“. Tage
 * mit denselben Blöcken stehen zusammen; abweichende Tage folgen nach „ · “.
 */
export function vorlagenText(vorlage: Arbeitszeitvorlage): string {
  const gruppen: { tage: Wochentag[]; bloecke: string }[] = [];
  for (const [tag, bloecke] of wochenplanDer(vorlage)) {
    const text = bloecke
      .map((block) => `${uhrzeit(block.von)}–${uhrzeit(block.bis)}`)
      .join(' und ');
    const gruppe = gruppen.find((eintrag) => eintrag.bloecke === text);
    if (gruppe) gruppe.tage.push(tag);
    else gruppen.push({ tage: [tag], bloecke: text });
  }
  return gruppen.map((gruppe) => `${tageText(gruppe.tage)} ${gruppe.bloecke}`).join(' · ');
}
