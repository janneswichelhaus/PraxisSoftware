// Der Auszug als Bauart (ANN-861): Ein Adapter nennt nur Stellen, der Gateway setzt die Sätze im
// Wortlaut. Ein Satz, der in keinem Eintrag steht, hat in der Antwort keinen Platz.

import { titelDerZeile } from './inhaltstreue.ts';
import { stuecke } from './waechter.ts';

/**
 * Die Sätze eines Eintrags: Eine Zeile, die nur ein Titel der Vorlage ist, ist Gliederung und
 * kein Satz. Ein Punkt nach einer Abkürzung beendet keinen Satz - sonst stünde ein halber da.
 */
export function auszugssaetze(text: string, vorlage: readonly string[]): string[] {
  const zeilen = text
    .split(/\r?\n/)
    .filter((zeile) => titelDerZeile(zeile.trim(), vorlage) === null);
  return stuecke(zeilen.join('\n')).map((stueck) => stueck.text);
}

/** Ein Eintrag der Eingabe mit seiner Kennung und seinen Sätzen. */
export interface Quelleintrag {
  readonly id: string;
  readonly saetze: readonly string[];
}

/**
 * ANN-861: je Eintrag die gewählten Sätze im Wortlaut, in der Reihenfolge des Eintrags. `null`,
 * wenn eine Stelle es nicht gibt, doppelt genannt ist oder ein Eintrag zu viele Sätze bekäme.
 */
export function setzeAuszug(
  eintraege: readonly Quelleintrag[],
  auswahl: unknown,
  hoechstJeEintrag: number,
): { id: string; saetze: string[] }[] | null {
  if (!Array.isArray(auswahl)) return null;
  const gewaehlt = eintraege.map(() => new Set<number>());
  for (const stelle of auswahl as unknown[]) {
    if (typeof stelle !== 'object' || stelle === null) return null;
    const { eintrag, satz } = stelle as { eintrag?: unknown; satz?: unknown };
    if (!Number.isInteger(eintrag) || !Number.isInteger(satz)) return null;
    const menge = gewaehlt[eintrag as number];
    const quelle = eintraege[eintrag as number];
    if (menge === undefined || quelle === undefined) return null;
    if ((satz as number) < 0 || (satz as number) >= quelle.saetze.length) return null;
    if (menge.has(satz as number)) return null;
    menge.add(satz as number);
    if (menge.size > hoechstJeEintrag) return null;
  }
  return eintraege.flatMap((eintrag, stelle) => {
    const saetze = eintrag.saetze.filter((_satz, nummer) => gewaehlt[stelle]!.has(nummer));
    return saetze.length > 0 ? [{ id: eintrag.id, saetze }] : [];
  });
}
