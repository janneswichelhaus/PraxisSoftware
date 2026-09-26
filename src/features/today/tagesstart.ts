import { formatLocalTime } from '@/features/appointments/api';
import { nachUhrzeit, type DayPlanEntry } from './api';

// -----------------------------------------------------------------------------
// Tagesstart (UX-EPIC-003)
//
// Was am Rad zählt, bevor losgefahren wird: der erste Weg, eine Vorschau auf
// den nächsten und ob die Behandlungsliege heute mit muss (§9). Reine
// Funktionen über der Tagesliste - keine eigene Abfrage, kein zweiter
// Lesepfad (ADR-004, Datenminimierung).
// -----------------------------------------------------------------------------

/**
 * Die Besuche des Tages in Uhrzeitfolge: alles außer Fehlzeiten und Absagen.
 *
 * ANN-117: Nach dieser Liste wird gezählt, wenn die Übersicht „ab dem 2.
 * Besuch" sagt. Ein abgeschlossener oder nicht angetroffener Besuch zählt
 * mit - er war der erste des Tages, auch wenn er schon hinter einem liegt. Ein
 * abgesagter zählt nicht: zu ihm fährt niemand.
 */
export function besucheDesTages(plan: readonly DayPlanEntry[]): DayPlanEntry[] {
  return [...plan]
    .filter((termin) => termin.kind !== 'internal' && termin.status !== 'cancelled')
    .sort(nachUhrzeit);
}

/** Noch anzufahren: bestätigt und damit weder erledigt noch abgesagt. */
function stehtAus(termin: DayPlanEntry): boolean {
  return termin.status === 'confirmed';
}

export interface Wege {
  /** Der nächste anzufahrende Besuch, oder `null`, wenn keiner mehr aussteht. */
  erster: DayPlanEntry | null;
  /** Ob vor ihm heute schon ein Besuch lag - dann heißt er „Nächster Weg". */
  istErsterDesTages: boolean;
  /** Der Besuch danach, als Vorschau. */
  danach: DayPlanEntry | null;
}

export function wegeDesTages(plan: readonly DayPlanEntry[]): Wege {
  const besuche = besucheDesTages(plan);
  const ausstehend = besuche.filter(stehtAus);
  const erster = ausstehend[0] ?? null;
  return {
    erster,
    istErsterDesTages: erster !== null && besuche[0]?.id === erster.id,
    danach: ausstehend[1] ?? null,
  };
}

export type LiegeHeute =
  | { noetig: false }
  | {
      noetig: true;
      /** Position in `besucheDesTages`, ab 1 gezählt. */
      besuch: number;
      termin: DayPlanEntry;
    };

/**
 * Muss die Behandlungsliege heute noch mit (§9, ANN-116)?
 *
 * Maßgeblich ist der früheste noch **anzufahrende** Besuch, dessen Person sie
 * braucht: Ist der Besuch mit Liege schon vorbei, muss sie für den Rest des
 * Tages nicht mehr aufs Rad. Das Merkmal liefert die Tagesliste nur am
 * Behandlungstermin; am Training ist es leer und zählt als nein.
 */
export function liegeHeute(plan: readonly DayPlanEntry[]): LiegeHeute {
  const besuche = besucheDesTages(plan);
  const index = besuche.findIndex(
    (termin) => stehtAus(termin) && termin.treatment_table_required === true,
  );
  if (index < 0) return { noetig: false };
  return { noetig: true, besuch: index + 1, termin: besuche[index]! };
}

/** „ja, ab 2. Besuch (10:30 Uhr)" - der Zustand als Wort, nicht als Farbe. */
export function liegeText(liege: LiegeHeute): string {
  if (!liege.noetig) return 'nein';
  const uhrzeit = formatLocalTime(liege.termin.starts_at, liege.termin.organization_time_zone);
  return `ja, ab ${liege.besuch}. Besuch (${uhrzeit} Uhr)`;
}
