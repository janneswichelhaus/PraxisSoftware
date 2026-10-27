import type { Variante } from '@/features/exercise/exercises/api';
import type { Katalogeintrag } from '@/features/exercise/exercises/katalog/typen';
import type { KatalogUebernahme, PositionEingabe } from './api';
import type { Dosis } from './dosierung';

/**
 * Übungen in einem Zug zum Plan hinzufügen (ANN-443; Welle B, Analyse Training 12.10.,
 * Abschnitt 5): jede mit ihrer Standarddosierung aus dem Katalog (ANN-384)
 * oder - bei eigenen Übungen ohne Standarddosierung - mit der Vorbelegung,
 * die das Formular schon immer hatte (3 × 10–12).
 *
 * Die Vorbelegung ist für alle gleich. Nichts hier liest Angaben einer
 * Person - keine Diagnose, kein Befund, kein Verlauf (ADR-006 Punkt 10).
 */

/**
 * So viele Positionen fasst ein Plan. Verbindlich prüft der Server
 * (`save_exercise_plan_item`, `add_catalog_exercises_for_plan`); hier nur,
 * damit das Auswahlblatt vorher sagt, wie viele noch passen.
 */
export const POSITIONEN_HOECHSTENS = 30;

/** Die Vorbelegung ohne Standarddosierung - dieselbe wie im Formular bis Welle B. */
export const OHNE_STANDARD: Dosis = {
  sets: 3,
  reps_min: 10,
  reps_max: 12,
  duration_seconds: null,
  load: null,
  tempo: null,
  rest_seconds: null,
  double_progression: false,
  hold_seconds: null,
  per_side: false,
  times_per_day: null,
};

/** Die Standarddosierung einer Variante in der Form der Planposition. */
export function standardDosis(variante: Pick<Variante, 'default_dosage'>): Dosis {
  const d = variante.default_dosage;
  if (!d) return OHNE_STANDARD;
  return {
    ...OHNE_STANDARD,
    sets: d.sets,
    reps_min: d.reps_min,
    reps_max: d.reps_max,
    duration_seconds: d.duration_seconds,
    hold_seconds: d.hold_seconds,
    per_side: d.per_side,
    times_per_day: d.times_per_day,
  };
}

/** Eine neue Position mit dieser Dosierung - ohne Hinweis, ohne Schritt. */
export function neuePosition(planId: string, variantId: string, d: Dosis): PositionEingabe {
  const mitWdh = d.reps_min !== null && d.reps_max !== null;
  return {
    planId,
    variantId,
    saetze: d.sets,
    wdhVon: mitWdh ? d.reps_min : null,
    wdhBis: mitWdh ? d.reps_max : null,
    dauer: mitWdh ? null : d.duration_seconds,
    last: d.load ?? '',
    tempo: d.tempo ?? '',
    pause: d.rest_seconds,
    doppelt: d.double_progression,
    hinweis: '',
    achse: null,
    richtung: null,
    // Halten gibt es nur zu Wiederholungen (ANN-384).
    halten: mitWdh ? (d.hold_seconds ?? null) : null,
    jeSeite: d.per_side ?? false,
    amTag: d.times_per_day ?? null,
  };
}

export interface Hinzufuegen {
  /** Wie viele angekommen sind - in der gewählten Reihenfolge. */
  hinzugefuegt: number;
  /** Der Grund, wenn eine scheiterte; danach wurde nichts mehr versucht. */
  fehler: string | null;
}

/**
 * Fügt die Positionen nacheinander hinzu, in der Reihenfolge der Wahl - der
 * Server hängt jede ans Ende. Scheitert eine, bleibt es bei den bis dahin
 * angekommenen, und der Grund steht in `fehler` (etwa „höchstens 30
 * Übungen"). Ein Aufruf je Position: Eine Serverfunktion für viele auf einmal
 * gibt es nicht, und dieser Auftrag bringt keine Migration.
 */
export async function fuegeHinzu(
  positionen: readonly PositionEingabe[],
  speichern: (eingabe: PositionEingabe) => Promise<unknown>,
  fortschritt?: (fertig: number) => void,
): Promise<Hinzufuegen> {
  let hinzugefuegt = 0;
  for (const position of positionen) {
    try {
      await speichern(position);
    } catch (fehler) {
      return {
        hinzugefuegt,
        fehler:
          fehler instanceof Error ? fehler.message : 'Die Übung konnte nicht gespeichert werden.',
      };
    }
    hinzugefuegt += 1;
    fortschritt?.(hinzugefuegt);
  }
  return { hinzugefuegt, fehler: null };
}

/** „5 Übungen hinzugefügt." - oder wie viele es bis zum Fehler waren. */
export function hinzugefuegtSatz(ergebnis: Hinzufuegen, gewaehlt: number): string {
  const n = (anzahl: number) => (anzahl === 1 ? '1 Übung' : `${anzahl} Übungen`);
  if (!ergebnis.fehler) return `${n(ergebnis.hinzugefuegt)} hinzugefügt.`;
  return `${ergebnis.hinzugefuegt} von ${n(gewaehlt)} hinzugefügt. ${ergebnis.fehler}`;
}

/** Eine gewählte Übung mit ihrer Dosierung - aus dem Katalog mit ihrem Eintrag. */
export interface Wunsch {
  variante: Pick<Variante, 'id'>;
  dosis: Dosis;
  /** Steht die Übung bisher nur im Katalog: der Eintrag, den der Server übernimmt. */
  eintrag?: Katalogeintrag | undefined;
}

/** Was nicht in den Plan kam, und warum. */
export interface NichtHinzugefuegt {
  name: string;
  grund: 'name' | 'archived' | 'fehlt';
}

/**
 * O-002 (Befund B9): übernimmt in einem Aufruf, was bisher nur im Katalog
 * steht, und baut dann die Positionen in der Reihenfolge der Wahl. Was der
 * Server nicht genommen hat - eine gleichnamige eigene Übung ohne eindeutige
 * Variante, ein archivierter Eintrag -, fällt heraus und steht in `nicht`.
 * Scheitert die Übernahme, wirft sie, und es entsteht keine Position.
 */
export async function mitKatalog(
  planId: string,
  wuensche: readonly Wunsch[],
  uebernehmen: (planId: string, eintraege: Katalogeintrag[]) => Promise<KatalogUebernahme>,
): Promise<{ positionen: PositionEingabe[]; nicht: NichtHinzugefuegt[] }> {
  const eintraege = wuensche.flatMap((w) => (w.eintrag ? [w.eintrag] : []));
  const antwort = eintraege.length > 0 ? await uebernehmen(planId, eintraege) : null;
  const nicht: NichtHinzugefuegt[] = [];
  const positionen = wuensche.flatMap((w) => {
    if (!w.eintrag) return [neuePosition(planId, w.variante.id, w.dosis)];
    const id = antwort?.variants[w.eintrag.schluessel];
    if (id) return [neuePosition(planId, id, w.dosis)];
    const konflikt = antwort?.conflicts.find((k) => k.catalog_key === w.eintrag?.schluessel);
    // 'missing': fehlt der Bibliothek, und übernehmen darf nur owner (ANN-293).
    const grund = !konflikt || konflikt.reason === 'missing' ? 'fehlt' : konflikt.reason;
    nicht.push({ name: w.eintrag.name, grund });
    return [];
  });
  return { positionen, nicht };
}

const GRUND: Readonly<Record<NichtHinzugefuegt['grund'], string>> = {
  name: 'Name schon vergeben',
  archived: 'archiviert',
  fehlt: 'nicht in der Bibliothek',
};

/** „Nicht hinzugefügt: Fußgleiten im Sitz (archiviert)." */
export function nichtSatz(nicht: readonly NichtHinzugefuegt[]): string | null {
  if (nicht.length === 0) return null;
  return `Nicht hinzugefügt: ${nicht.map((n) => `${n.name} (${GRUND[n.grund]})`).join(', ')}.`;
}
