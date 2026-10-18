/**
 * Die Regeln der Formatierung im Teamchat (TEAM-002, ANN-649) - rein, ohne
 * Oberfläche; dargestellt wird in `format.tsx`.
 */

const WORTZEICHEN = /[\p{L}\p{N}]/u;
const LEERRAUM = /\s/;

/**
 * Die erste Auszeichnung mit `zeichen` (wie Slack): außen kein Buchstabe und
 * keine Ziffer, innen am Rand kein Leerraum, alles in einer Zeile. Ein Lauf
 * über die Zeichen statt eines verschachtelten Musters.
 */
export function auszeichnung(text: string, zeichen: string): { an: number; innen: string } | null {
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] !== zeichen) continue;
    const vor = i === 0 ? '' : text.charAt(i - 1);
    if (vor && (WORTZEICHEN.test(vor) || vor === zeichen)) continue;
    const nach = text.charAt(i + 1);
    if (!nach || LEERRAUM.test(nach) || nach === zeichen) continue;
    for (let j = i + 2; j < text.length; j += 1) {
      const c = text.charAt(j);
      if (c === '\n') break;
      if (c !== zeichen) continue;
      if (LEERRAUM.test(text.charAt(j - 1))) continue;
      const danach = text.charAt(j + 1);
      if (danach && (WORTZEICHEN.test(danach) || danach === zeichen)) continue;
      return { an: i, innen: text.slice(i + 1, j) };
    }
  }
  return null;
}

export type Block =
  | { art: 'absatz'; zeilen: string[] }
  | { art: 'zitat'; zeilen: string[] }
  | { art: 'code'; text: string }
  | { art: 'liste'; nummeriert: boolean; punkte: string[] };

/** Zerlegt den Text in Blöcke - rein, damit es sich ohne Oberfläche prüfen lässt. */
export function bloecke(text: string): Block[] {
  const ergebnis: Block[] = [];
  const zeilen = text.split('\n');
  let i = 0;
  while (i < zeilen.length) {
    const z = zeilen[i]!;
    if (z.trimStart().startsWith('```')) {
      const innen: string[] = [];
      const erste = z.trimStart().slice(3);
      if (erste.includes('```')) {
        ergebnis.push({ art: 'code', text: erste.slice(0, erste.indexOf('```')) });
        i += 1;
        continue;
      }
      if (erste) innen.push(erste);
      i += 1;
      while (i < zeilen.length && !zeilen[i]!.includes('```')) {
        innen.push(zeilen[i]!);
        i += 1;
      }
      if (i < zeilen.length) {
        const letzte = zeilen[i]!.slice(0, zeilen[i]!.indexOf('```'));
        if (letzte) innen.push(letzte);
        i += 1;
      }
      ergebnis.push({ art: 'code', text: innen.join('\n') });
      continue;
    }
    if (/^>\s?/.test(z)) {
      const innen: string[] = [];
      while (i < zeilen.length && /^>\s?/.test(zeilen[i]!)) {
        innen.push(zeilen[i]!.replace(/^>\s?/, ''));
        i += 1;
      }
      ergebnis.push({ art: 'zitat', zeilen: innen });
      continue;
    }
    const punkt = /^\s*([-*•])\s+(.*)$/.exec(z);
    const nummer = /^\s*(\d{1,3})[.)]\s+(.*)$/.exec(z);
    if (punkt || nummer) {
      const nummeriert = !punkt;
      const punkte: string[] = [];
      while (i < zeilen.length) {
        const t = nummeriert
          ? /^\s*\d{1,3}[.)]\s+(.*)$/.exec(zeilen[i]!)
          : /^\s*[-*•]\s+(.*)$/.exec(zeilen[i]!);
        if (!t) break;
        punkte.push(t[1] ?? '');
        i += 1;
      }
      ergebnis.push({ art: 'liste', nummeriert, punkte });
      continue;
    }
    const absatz: string[] = [];
    while (
      i < zeilen.length &&
      !zeilen[i]!.trimStart().startsWith('```') &&
      !/^>\s?/.test(zeilen[i]!) &&
      !/^\s*([-*•])\s+/.test(zeilen[i]!) &&
      !/^\s*\d{1,3}[.)]\s+/.test(zeilen[i]!)
    ) {
      absatz.push(zeilen[i]!);
      i += 1;
    }
    ergebnis.push({ art: 'absatz', zeilen: absatz });
  }
  return ergebnis;
}

/** Der Text ohne Zeichen der Formatierung - für eine Zeile in Listen. */
export function ohneFormatierung(text: string): string {
  let ergebnis = text
    .replace(/```/g, '')
    .replace(/`([^`\n]+)`/g, '$1')
    .replace(/^>\s?/gm, '');
  for (const zeichen of ['*', '_', '~']) {
    for (let runde = 0; runde < 50; runde += 1) {
      const treffer = auszeichnung(ergebnis, zeichen);
      if (!treffer) break;
      ergebnis =
        ergebnis.slice(0, treffer.an) +
        treffer.innen +
        ergebnis.slice(treffer.an + treffer.innen.length + 2);
    }
  }
  return ergebnis.replace(/\s+/g, ' ').trim();
}
