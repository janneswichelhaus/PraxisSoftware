import { gewaehlteKennungen, type Antworten } from './antworten';
import {
  optionKennung,
  type HervorhebungsRegel,
  type ScoreDefinition,
  type ScoreItem,
} from './schema';

/**
 * Hervorhebung auffälliger Angaben nach `PROJECT_PRINCIPLES.md` §7.1
 * (FRB-002c, **ANN-104**).
 *
 * Das Ergebnis enthält **nur**, was die Person angekreuzt hat, wörtlich aus
 * der Definition, und die Regel, nach der es hervorgehoben ist. Es enthält
 * keine Stufe, keinen Score, keine Zusammenfassung und keinen Hinweis auf
 * einen nächsten Schritt (ADR-006 Punkt 3, 11 und 12). Mehrere Treffer werden
 * nicht verrechnet: Zwei Hervorhebungen sind zwei Zeilen, nicht „erhöht".
 */
export interface Hervorhebung {
  regel: HervorhebungsRegel;
  item: ScoreItem;
  /** Die Beschriftungen der angekreuzten Optionen, unverändert. */
  angaben: string[];
}

export function hervorhebungen(definition: ScoreDefinition, antworten: Antworten): Hervorhebung[] {
  return definition.hervorhebungen.flatMap((regel) => {
    const item = definition.items.find((eintrag) => eintrag.id === regel.item);
    if (!item) return [];
    const gewaehlt = gewaehlteKennungen(antworten[item.id]);
    const angaben = (item.optionen ?? [])
      .filter((option) => {
        const kennung = optionKennung(option);
        return regel.optionen.includes(kennung) && gewaehlt.includes(kennung);
      })
      .map((option) => option.label);
    return angaben.length > 0 ? [{ regel, item, angaben }] : [];
  });
}
