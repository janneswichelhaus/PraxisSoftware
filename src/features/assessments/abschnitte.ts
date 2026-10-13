import type { ScoreItem } from './schema';

/**
 * Ein Abschnitt eines Bogens auf der Erhebungsseite (Design-Rollout B4):
 * aufeinanderfolgende Fragen, die zusammen auf- und zugeklappt werden.
 */
export interface Abschnitt {
  /** „Fragen 7–12“, mit Fragen ohne Nummer: „Beruf, Sport/Hobby · Fragen 1–6“. */
  titel: string;
  items: ScoreItem[];
}

/** So viele Fragen fasst ein Abschnitt ungefähr. */
export const ABSCHNITT_GROESSE = 8;

/**
 * Teilt die Fragen eines Bogens in Abschnitte - nur für die Darstellung.
 *
 * Die Definition kennt keine Abschnitte, und sie bekommt keine: Ein neuer
 * Fragebogen ist eine Datei, keine Komponente (FRB-002b), und Wortlaut,
 * Reihenfolge und Antworten bleiben, wie sie sind. Geschnitten wird deshalb
 * nach Regeln, die für jeden Bogen gelten:
 *
 *   * Fragen mit derselben gedruckten Nummer bleiben zusammen (26 mit ihren
 *     Folgefragen, 12a und 12b);
 *   * ein Hinweis für mehrere Fragen („Zur Beantwortung der Fragen 13-20 …“)
 *     beginnt einen eigenen Abschnitt und endet mit ihm;
 *   * sonst endet ein Abschnitt nach etwa `groesse` Fragen.
 *
 * Ein kurzer Bogen bleibt ein Abschnitt.
 */
export function abschnitte(
  items: readonly ScoreItem[],
  groesse: number = ABSCHNITT_GROESSE,
): Abschnitt[] {
  const gruppen: ScoreItem[][] = [];
  let aktuell: ScoreItem[] = [];

  items.forEach((item, index) => {
    const vorher = items[index - 1];
    const hinweisWechsel = vorher !== undefined && (item.hinweis ?? '') !== (vorher.hinweis ?? '');
    const gleicheNummer =
      vorher !== undefined && item.nummer !== undefined && item.nummer === vorher.nummer;
    const voll = aktuell.length >= groesse && !gleicheNummer;
    if (aktuell.length > 0 && (voll || (hinweisWechsel && !gleicheNummer))) {
      gruppen.push(aktuell);
      aktuell = [];
    }
    aktuell.push(item);
  });
  if (aktuell.length > 0) gruppen.push(aktuell);

  return gruppen.map((gruppe) => ({ titel: titelFuer(gruppe), items: gruppe }));
}

function titelFuer(items: readonly ScoreItem[]): string {
  const nummern = items.flatMap((item) => (item.nummer === undefined ? [] : [item.nummer]));
  const ohneNummer = items
    .filter((item) => item.nummer === undefined)
    .map((item) => item.text.replace(/:$/, ''));
  const erste = Math.min(...nummern);
  const letzte = Math.max(...nummern);
  const bereich =
    nummern.length === 0 ? null : erste === letzte ? `Frage ${erste}` : `Fragen ${erste}–${letzte}`;
  // Fragen ohne Nummer stehen dort, wo sie im Bogen stehen: vor oder nach
  // den nummerierten.
  const vorn = items[0]?.nummer === undefined;
  return [vorn ? ohneNummer.join(', ') : null, bereich, vorn ? null : ohneNummer.join(', ')]
    .filter((teil): teil is string => Boolean(teil))
    .join(' · ');
}
