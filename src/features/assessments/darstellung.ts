import type { Antworten } from './antworten';
import type { ScoreItem } from './schema';

/**
 * Kleine Hilfen der Oberfläche für Erhebungen (FRB-002b), getrennt von den
 * Komponenten, damit das schnelle Neuladen im Entwicklungsserver greift.
 */

/** Die gedruckte Nummer und, wo die Praxis einträgt, der Hinweis darauf. */
export function beschriftung(item: ScoreItem): string {
  const nummer = item.nummer ? `${item.nummer}. ` : '';
  const praxis = item.ausgefuellt_von === 'therapeut' ? ' (Praxis)' : '';
  return `${nummer}${item.text}${praxis}`;
}

/** Der Buchstabe einer Teilfrage, wie er im Bogen steht: „a) Was verbessert …" → „a". */
const TEILFRAGE = /^([a-z])\)\s/;

/**
 * Die offenen Fragen eines Bogens als kurze Liste (BEF-11).
 *
 * Mehrere Items tragen dieselbe gedruckte Nummer: die Tumorfrage 26 mit ihren
 * drei Folgefragen, 12a und 12b. Eine Nummer allein steht deshalb nur da,
 * wenn **alle** ihre Items offen sind - sonst stünde unter „26 … nein" ein
 * „Nicht beantwortet: 26", das der Antwort darüber widerspricht. Offene
 * Teilfragen heißen mit dem Buchstaben aus dem Bogen („12b"), Folgefragen
 * ohne Buchstaben mit ihrem Wortlaut („26 (Welche/n?, Wann?)"). Items ohne
 * Nummer nennt ihr Wortlaut.
 */
export function offeneFragen(items: readonly ScoreItem[], antworten: Antworten): string[] {
  const eintraege: string[] = [];
  const erledigt = new Set<number>();
  const offen = (item: ScoreItem) => antworten[item.id] === undefined;
  const wortlaut = (item: ScoreItem) => item.text.replace(/:$/, '');

  for (const item of items) {
    if (item.nummer === undefined) {
      if (offen(item)) eintraege.push(wortlaut(item));
      continue;
    }
    if (erledigt.has(item.nummer)) continue;
    erledigt.add(item.nummer);

    const gruppe = items.filter((i) => i.nummer === item.nummer);
    const offene = gruppe.filter(offen);
    if (offene.length === 0) continue;
    if (offene.length === gruppe.length) {
      eintraege.push(String(item.nummer));
      continue;
    }
    const buchstaben = offene.map((i) => TEILFRAGE.exec(i.text)?.[1]);
    if (buchstaben.every((b) => b !== undefined)) {
      eintraege.push(...buchstaben.map((b) => `${item.nummer}${b}`));
    } else {
      eintraege.push(`${item.nummer} (${offene.map(wortlaut).join(', ')})`);
    }
  }
  return eintraege;
}

/**
 * Die Kennung einer Frage im Bogen: Sprungziel der Fehlerzusammenfassung
 * (BEF-03). Die Kennungen der Items sind je Definition eindeutig.
 */
export function frageFeldId(itemId: string): string {
  return `frage-${itemId}`;
}

/**
 * Enter in einem einzeiligen Feld schickt den Bogen nicht ab (BEF-09).
 *
 * Wer am Telefon mit „Return" die Tastatur schließt, soll im Bogen bleiben -
 * nicht mitten in Frage 27 gespeichert und in die Akte zurückgebracht werden.
 * Gilt auch dort, wo ein Feld im Formular einer anderen Seite steht, etwa das
 * Bausteinfeld in „Behandlung abschließen".
 */
export function ohneAbsenden(event: { key: string; preventDefault: () => void }): void {
  if (event.key === 'Enter') event.preventDefault();
}

/** Der Weg zur Erhebungsseite: neu, als Entwurf oder als Korrektur. */
export function erhebenPfad(
  patientId: string,
  instrumentId: string,
  zusatz: { entwurf?: string; korrigiert?: string } = {},
): string {
  const suche = new URLSearchParams({ instrument: instrumentId });
  if (zusatz.entwurf) suche.set('entwurf', zusatz.entwurf);
  if (zusatz.korrigiert) suche.set('korrigiert', zusatz.korrigiert);
  return `/patienten/${patientId}/befund/erheben?${suche.toString()}`;
}
