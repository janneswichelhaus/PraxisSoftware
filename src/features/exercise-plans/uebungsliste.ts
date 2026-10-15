import type { Bibliothek, Uebung, Variante } from '@/features/exercises/api';
import { alsDosis } from '@/features/exercises/katalog/dosierung';
import { ausruestungVon } from '@/features/exercises/katalog/schema';
import type { Katalogeintrag } from '@/features/exercises/katalog/typen';

/**
 * Eine Übungsliste statt Katalog und Bibliothek (Befund B9, O-002).
 *
 * Wer einen Plan zusammenstellt, wählt aus einer Liste: der Bibliothek der
 * Praxis und jedem Eintrag des mitgelieferten Katalogs, den sie noch nicht
 * hat. Ein Katalogeintrag steht dort in der Form einer Übung der Bibliothek -
 * so, wie der Import ihn anlegen würde -, damit Suche, Filter und Zeile
 * dieselben bleiben. Beim Hinzufügen übernimmt der Server ihn still
 * (`addCatalogExercises`), danach entsteht die Position wie bei jeder Übung.
 *
 * Vorhanden ist ein Eintrag, wenn die Bibliothek seinen Katalogschlüssel
 * kennt - auch archiviert: Was die Praxis archiviert hat, kommt nicht über
 * den Katalog zurück. Eine eigene Übung gleichen Namens zählt ebenso; der
 * Server nähme sie ohnehin statt des Eintrags.
 *
 * Geordnet nach Bezeichnung und nach nichts sonst; nichts liest Angaben einer
 * Person (ADR-006 Punkt 10).
 */

const PRAEFIX = 'katalog:';

/** Die Kennung eines Eintrags, solange er nur im Katalog steht. */
export function katalogKennung(schluessel: string): string {
  return `${PRAEFIX}${schluessel}`;
}

/** Steht diese Variante bisher nur im Katalog? */
export function nurImKatalog(variante: Pick<Variante, 'id'>): boolean {
  return variante.id.startsWith(PRAEFIX);
}

/** Ein Katalogeintrag als Variante der Bibliothek - wie der Import ihn anlegt. */
export function alsVariante(e: Katalogeintrag): Variante {
  const d = alsDosis(e.dosierung);
  return {
    id: katalogKennung(e.schluessel),
    name: e.name,
    lay_name: e.alltagsname,
    instruction: e.anleitung.join('\n'),
    equipment: ausruestungVon(e),
    common_faults: e.fehler.join('\n'),
    practice_notes: e.hinweise_praxis ?? null,
    archived: false,
    catalog_key: e.schluessel,
    catalog_version: e.version,
    goal: e.ziel,
    starting_position: e.ausgangsstellung,
    level: e.niveau,
    default_dosage: {
      sets: d.sets,
      reps_min: d.reps_min,
      reps_max: d.reps_max,
      duration_seconds: d.duration_seconds,
      hold_seconds: d.hold_seconds ?? null,
      per_side: d.per_side ?? false,
      times_per_day: d.times_per_day ?? null,
    },
    illustration: e.bild ?? null,
    // Ohne Prüfvermerk: ungeprüft, bis owner durchsieht (ANN-386).
    reviewed_at: null,
    reviewed_by_name: null,
  };
}

/** Ein Katalogeintrag als Übung mit seiner einen Variante. */
export function alsUebung(e: Katalogeintrag): Uebung {
  return {
    id: katalogKennung(e.schluessel),
    name: e.name,
    lay_name: e.alltagsname,
    body_region: e.region,
    archived: false,
    variants: [alsVariante(e)],
  };
}

function namensform(name: string): string {
  return name.trim().toLocaleLowerCase('de');
}

/** Was die Bibliothek schon hat: Katalogschlüssel und Namen der Übungen. */
function vorhanden(bibliothek: Bibliothek) {
  const schluessel = new Set<string>();
  const namen = new Set<string>();
  for (const uebung of bibliothek.exercises) {
    namen.add(namensform(uebung.name));
    for (const variante of uebung.variants) {
      if (variante.catalog_key) schluessel.add(variante.catalog_key);
    }
  }
  return { schluessel, namen };
}

/** Die Katalogeinträge, die der Bibliothek fehlen - in der Reihenfolge des Katalogs. */
export function fehlendImKatalog(
  bibliothek: Bibliothek,
  katalog: readonly Katalogeintrag[],
): Katalogeintrag[] {
  const { schluessel, namen } = vorhanden(bibliothek);
  return katalog.filter((e) => !schluessel.has(e.schluessel) && !namen.has(namensform(e.name)));
}

/** Bibliothek und fehlende Katalogeinträge als eine Liste, nach Bezeichnung. */
export function eineListe(bibliothek: Bibliothek, katalog: readonly Katalogeintrag[]): Uebung[] {
  const dazu = fehlendImKatalog(bibliothek, katalog).map(alsUebung);
  if (dazu.length === 0) return [...bibliothek.exercises];
  return [...bibliothek.exercises, ...dazu].sort((a, b) =>
    a.name.localeCompare(b.name, 'de', { sensitivity: 'base' }),
  );
}
