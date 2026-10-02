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
  /** Scores, eine Datei je Instrument - die aktuelle Fassung. */
  scores: ScoreDefinition[];
  /**
   * Alle Fassungen der Scores, die aktuellen und die aus `scores/archiv/`
   * (ABN-014, BEF-101 Punkt 1): Eine Erhebung wird mit der Fassung angezeigt
   * und ausgewertet, mit der sie erhoben wurde. Ältere Fassungen bleiben
   * deshalb im Release.
   */
  scoreFassungen: ScoreDefinition[];
}

const BAUSTEIN_PFAD = '/bausteine/';
const SCORE_PFAD = '/scores/';
const ARCHIV_PFAD = '/scores/archiv/';

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
  const archiv: ScoreDefinition[] = [];
  const fehler: string[] = [];

  for (const pfad of Object.keys(rohdaten).sort()) {
    const rohwert = rohdaten[pfad];

    if (pfad.includes(BAUSTEIN_PFAD)) {
      const ergebnis = bausteinRegionSchema.safeParse(rohwert);
      if (ergebnis.success) bausteine.push(ergebnis.data);
      else fehler.push(...fehlerzeilen(pfad, ergebnis.error.issues));
    } else if (pfad.includes(SCORE_PFAD)) {
      const ergebnis = scoreDefinitionSchema.safeParse(rohwert);
      if (!ergebnis.success) fehler.push(...fehlerzeilen(pfad, ergebnis.error.issues));
      else if (pfad.includes(ARCHIV_PFAD)) archiv.push(ergebnis.data);
      else scores.push(ergebnis.data);
    } else {
      fehler.push(`${pfad}: (Wurzel) — Definition muss unter "bausteine/" oder "scores/" liegen.`);
    }
  }

  fehler.push(...doppelteKennungen(bausteine, scores));
  fehler.push(...archivFehler(scores, archiv));

  if (fehler.length > 0) {
    throw new Error(`Ungültige Definitionen:\n${fehler.join('\n')}`);
  }

  return { bausteine, scores, scoreFassungen: [...scores, ...archiv] };
}

/** „1.2.3" → [1, 2, 3]. */
function versionsteile(version: string): number[] {
  return version.split('.').map(Number);
}

function vergleicheVersionen(a: string, b: string): number {
  const [x, y] = [versionsteile(a), versionsteile(b)];
  for (let i = 0; i < 3; i++) {
    const unterschied = (x[i] ?? 0) - (y[i] ?? 0);
    if (unterschied !== 0) return unterschied;
  }
  return 0;
}

/**
 * Das Archiv früherer Fassungen (ABN-014, BEF-101 Punkt 1 und 4).
 *
 *   1. Jede archivierte Fassung gehört zu einem aktuellen Instrument und ist
 *      älter als dessen Fassung; keine Fassung liegt doppelt vor.
 *   2. `vergleichbar_mit` nennt nur ältere Fassungen, die es gibt.
 *   3. Eine Fassung, die sich nur in der Patch-Stelle unterscheidet, ist eine
 *      bedeutungserhaltende Korrektur und muss als vergleichbar vermerkt sein
 *      (ANN-084) - sonst sagt die Nummer etwas anderes als die Definition.
 */
function archivFehler(scores: ScoreDefinition[], archiv: ScoreDefinition[]): string[] {
  const fehler: string[] = [];
  const gesehen = new Set(scores.map((s) => `${s.meta.id}@${s.meta.version}`));
  for (const alt of archiv) {
    const schluessel = `${alt.meta.id}@${alt.meta.version}`;
    const aktuell = scores.find((s) => s.meta.id === alt.meta.id);
    if (gesehen.has(schluessel)) fehler.push(`Fassung "${schluessel}" liegt doppelt vor.`);
    gesehen.add(schluessel);
    if (!aktuell) {
      fehler.push(`Archivierte Fassung "${schluessel}" gehört zu keinem aktuellen Instrument.`);
    } else if (vergleicheVersionen(alt.meta.version, aktuell.meta.version) >= 0) {
      fehler.push(
        `Archivierte Fassung "${schluessel}" ist nicht älter als die aktuelle ${aktuell.meta.version}.`,
      );
    }
  }
  for (const score of [...scores, ...archiv]) {
    const aeltere = [...scores, ...archiv].filter(
      (s) =>
        s.meta.id === score.meta.id && vergleicheVersionen(s.meta.version, score.meta.version) < 0,
    );
    const vermerkt = score.meta.vergleichbar_mit ?? [];
    for (const version of vermerkt) {
      if (!aeltere.some((s) => s.meta.version === version)) {
        fehler.push(
          `"${score.meta.id}@${score.meta.version}" nennt in vergleichbar_mit die Fassung ${version}, die es nicht als ältere gibt.`,
        );
      }
    }
    const [major, minor] = versionsteile(score.meta.version);
    for (const alt of aeltere) {
      const [aMajor, aMinor] = versionsteile(alt.meta.version);
      if (aMajor === major && aMinor === minor && !vermerkt.includes(alt.meta.version)) {
        fehler.push(
          `"${score.meta.id}@${score.meta.version}" unterscheidet sich von ${alt.meta.version} nur in der Patch-Stelle und muss sie in vergleichbar_mit nennen (ANN-084).`,
        );
      }
    }
  }
  return fehler;
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
