import { EINTRAEGE as AF } from './eintraege/af';
import { EINTRAEGE as AT } from './eintraege/at';
import { EINTRAEGE as AU } from './eintraege/au';
import { EINTRAEGE as BT } from './eintraege/bt';
import { EINTRAEGE as BW } from './eintraege/bw';
import { EINTRAEGE as EH } from './eintraege/eh';
import { EINTRAEGE as FU } from './eintraege/fu';
import { EINTRAEGE as GG } from './eintraege/gg';
import { EINTRAEGE as HU } from './eintraege/hu';
import { EINTRAEGE as HW } from './eintraege/hw';
import { EINTRAEGE as KN } from './eintraege/kn';
import { EINTRAEGE as LW } from './eintraege/lw';
import { EINTRAEGE as NE } from './eintraege/ne';
import { EINTRAEGE as SH } from './eintraege/sh';
import type { Gruppe, Katalogeintrag } from './typen';

/**
 * Der mitgelieferte Übungskatalog (ANN-382): Produktinhalt im Release, ohne
 * `organization_id` - für alle Praxen gleich, wie die Instrumente der
 * Assessments (ANN-083). Die Praxis übernimmt ihn als Kopie in ihre
 * Bibliothek (`import_exercise_catalog`, nur owner, ANN-293); ab dann ist es
 * ihre Bibliothek, und ein späterer Import überschreibt nichts.
 *
 * Der Inhalt ist KI-erstellt und gilt bis zur Durchsicht durch die
 * Praxis als ungeprüft (ANN-386): Gebaut wird mit synthetischen Daten, der
 * Einsatz bei echten Patient:innen wartet auf die Durchsicht (§15.2).
 *
 * Je Gruppe eine Datei unter `eintraege/`. Die Dateien importieren nur Typen
 * (`import type`), damit `scripts/katalog-sql.mjs` sie ohne Bundler liest.
 */
export const KATALOG_GRUPPEN: Readonly<Record<Gruppe, readonly Katalogeintrag[]>> = {
  bt: BT,
  hw: HW,
  bw: BW,
  lw: LW,
  sh: SH,
  eh: EH,
  hu: HU,
  kn: KN,
  fu: FU,
  gg: GG,
  af: AF,
  at: AT,
  ne: NE,
  au: AU,
};

/** Alle Einträge in der Reihenfolge der Gruppen und Schlüssel. */
export const KATALOG: readonly Katalogeintrag[] = Object.values(KATALOG_GRUPPEN).flat();

export function katalogeintrag(schluessel: string): Katalogeintrag | undefined {
  return KATALOG.find((e) => e.schluessel === schluessel);
}
