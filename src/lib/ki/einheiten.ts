import { saetze } from '@/lib/ki/gateway';

// Getippter Text in Sätzen, zeilenweise - dieselbe Zerlegung wie `einheiten` im Gateway
// (`inhaltstreue.ts`); `vertrag.test.ts` hält beide gleich. Daran prüft die Seite den Wortlaut.

/** Ein Satz getippten Textes: Wortlaut, Zeile und der Titel der Vorlage, unter dem er steht. */
export interface Einheit {
  readonly text: string;
  readonly zeile: number;
  readonly titel: string | null;
}

/** Der Titel der Vorlage, der allein in dieser Zeile steht - mit oder ohne Doppelpunkt. */
export function titelDerZeile(zeile: string, vorlage: readonly string[]): string | null {
  const ohne = zeile.replace(/:$/, '').trim().toLowerCase();
  return vorlage.find((titel) => titel.toLowerCase() === ohne) ?? null;
}

/**
 * Eine Zeile, die nur ein Titel der Vorlage ist, ist Gliederung und kein Satz: Was bis zur
 * nächsten Leerzeile darunter steht, gilt als schon geordnet.
 */
export function einheiten(text: string, vorlage: readonly string[]): Einheit[] {
  const liste: Einheit[] = [];
  let titel: string | null = null;
  for (const [zeile, roh] of text.split(/\r?\n/).entries()) {
    const inhalt = roh.trim();
    if (inhalt === '') {
      titel = null;
      continue;
    }
    const gliederung = titelDerZeile(inhalt, vorlage);
    if (gliederung !== null) {
      titel = gliederung;
      continue;
    }
    for (const satz of saetze(inhalt)) liste.push({ text: satz, zeile, titel });
  }
  return liste;
}

/** Sätze derselben Zeile mit Leerzeichen, verschiedener Zeilen mit Zeilenwechsel. */
export function verbinde(liste: readonly Einheit[]): string {
  let text = '';
  for (const [stelle, einheit] of liste.entries()) {
    if (stelle > 0) text += liste[stelle - 1]!.zeile === einheit.zeile ? ' ' : '\n';
    text += einheit.text;
  }
  return text;
}

/** ANN-861: dieselben Sätze, jeder so oft wie auf der anderen Seite? Daran hängt jede Anzeige. */
export function gleicheSaetze(eins: readonly string[], zwei: readonly string[]): boolean {
  const links = [...eins].sort();
  const rechts = [...zwei].sort();
  return links.length === rechts.length && links.every((satz, stelle) => satz === rechts[stelle]);
}
