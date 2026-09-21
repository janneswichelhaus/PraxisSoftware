import { bausteinRegionSchema, scoreDefinitionSchema, type BausteinRegion } from './schema';
import type { ScoreDefinition } from './schema';

/**
 * Der Ladepfad der Instrumentenbibliothek (FRB-007).
 *
 * Definitionen liegen als Dateien unter `definitionen/` und sind Produktinhalt:
 * für alle Mandanten gleich, Teil des Releases, ohne `organization_id` und ohne
 * Datenbank (**ANN-083**). Nur so ist `definition_version` etwas Festes —
 * läge die Bibliothek je Mandant in der Datenbank, hieße „Version 1.2.0" in
 * zwei Praxen womöglich Verschiedenes. **Ergebnisse** sind das Gegenteil:
 * Gesundheitsdaten mit Datenklasse, Frist und RLS. Sie kommen in Phase P6 und
 * gehören nicht hierher.
 *
 * Diese Funktion nimmt die Rohdaten entgegen, statt sie selbst zu lesen: So
 * ist sie ohne Dateisystem und ohne Bundler prüfbar. Das Einsammeln der
 * Dateien steht in `bibliothek.ts`.
 */

export interface Bibliothek {
  /** Untersuchungsbausteine, eine Datei je Region. */
  bausteine: BausteinRegion[];
  /** Scores, eine Datei je Instrument. */
  scores: ScoreDefinition[];
}

const BAUSTEIN_PFAD = '/bausteine/';
const SCORE_PFAD = '/scores/';

/** Eine Zeile je verletzter Zusicherung: Datei, Feldpfad, Klartext. */
function fehlerzeilen(pfad: string, issues: { path: PropertyKey[]; message: string }[]): string[] {
  return issues.map((issue) => {
    const feld = issue.path.length > 0 ? issue.path.join('.') : '(Wurzel)';
    return `${pfad}: ${feld} — ${issue.message}`;
  });
}

/**
 * Prüft jede Definition gegen ihr Schema und die Bibliothek gegen sich selbst.
 *
 * Zwei Dinge kann nur der Ladepfad sehen, nicht das Schema einer einzelnen
 * Datei:
 *
 *   1. **Doppelte Kennungen über Dateien hinweg.** Zwei Regionen mit derselben
 *      `id`, oder derselbe Test in zwei Regionen — ein gespeichertes Ergebnis
 *      zeigte danach auf zwei Dinge. Kennungen sind unveränderlich; doppelt
 *      vergeben sind sie unbrauchbar.
 *   2. **Eine Datei am falschen Ort.** Ein Score unter `bausteine/` fällt sonst
 *      erst auf, wenn ihn jemand sucht.
 *
 * Der Fehler nennt **alle** Fundstellen auf einmal. Wer 18 Dateien überträgt,
 * soll nicht 18-mal starten müssen, um 18 Tippfehler zu finden.
 */
export function ladeDefinitionen(rohdaten: Record<string, unknown>): Bibliothek {
  const bausteine: BausteinRegion[] = [];
  const scores: ScoreDefinition[] = [];
  const fehler: string[] = [];

  for (const pfad of Object.keys(rohdaten).sort()) {
    const rohwert = rohdaten[pfad];

    if (pfad.includes(BAUSTEIN_PFAD)) {
      const ergebnis = bausteinRegionSchema.safeParse(rohwert);
      if (ergebnis.success) bausteine.push(ergebnis.data);
      else fehler.push(...fehlerzeilen(pfad, ergebnis.error.issues));
    } else if (pfad.includes(SCORE_PFAD)) {
      const ergebnis = scoreDefinitionSchema.safeParse(rohwert);
      if (ergebnis.success) scores.push(ergebnis.data);
      else fehler.push(...fehlerzeilen(pfad, ergebnis.error.issues));
    } else {
      fehler.push(`${pfad}: (Wurzel) — Definition muss unter "bausteine/" oder "scores/" liegen.`);
    }
  }

  fehler.push(...doppelteKennungen(bausteine, scores));

  if (fehler.length > 0) {
    throw new Error(`Ungültige Definitionen:\n${fehler.join('\n')}`);
  }

  return { bausteine, scores };
}

function doppelteKennungen(bausteine: BausteinRegion[], scores: ScoreDefinition[]): string[] {
  const fehler: string[] = [];

  const doppelt = (kennungen: string[], was: string): void => {
    const gesehen = new Set<string>();
    for (const kennung of kennungen) {
      if (gesehen.has(kennung)) fehler.push(`${was} "${kennung}" ist doppelt vergeben.`);
      gesehen.add(kennung);
    }
  };

  doppelt(
    bausteine.map((region) => region.id),
    'Region',
  );
  doppelt(
    scores.map((score) => score.meta.id),
    'Score',
  );

  // Testkennungen gelten ueber alle Regionen hinweg: Ein Ergebnis haelt die
  // Kennung des Tests fest, nicht das Paar aus Region und Test. Deshalb ist
  // `knie_lachmann_test` in zwei Regionen ein Fehler, keine Doppelung.
  doppelt(
    bausteine.flatMap((region) =>
      region.blocks.flatMap((block) =>
        block.items.flatMap((item) => [
          item.id,
          ...(item.subitems ?? []).map((subitem) => subitem.id),
        ]),
      ),
    ),
    'Test- oder Technikkennung',
  );

  doppelt(
    bausteine.flatMap((region) => region.blocks.map((block) => `${region.id}.${block.id}`)),
    'Block',
  );

  return fehler;
}
