/**
 * Die Fortschrittstabelle der Roadmap, erzeugt aus `docs/development/fortschritt.json`.
 *
 * Umbau U3 (2026-09-23): Die JSON-Datei ist die **einzige** Quelle. Frueher
 * standen Status und Commits zweimal - in der Datei und in einer von Hand
 * gepflegten Tabelle der Roadmap - und liefen auseinander. Jetzt schreibt
 * `pnpm fortschritt --schreiben` die Tabelle zwischen die beiden Marken, und
 * `pnpm docs:check` meldet jede Abweichung.
 *
 * Reine Funktionen ohne Dateizugriff, damit `scripts/docs-check.test.mjs` sie
 * mit kleinen Daten pruefen kann.
 */

export const ANFANG =
  '<!-- fortschritt:anfang (erzeugt von pnpm fortschritt --schreiben, nicht von Hand aendern) -->';
export const ENDE = '<!-- fortschritt:ende -->';

const zelle = (wert) => (wert ? String(wert).replaceAll('|', '\\|') : '—');

/** Markdown-Tabelle aller Posten, die nicht mehr `offen` sind, je Block in der Reihenfolge der Datei. */
export function fortschrittTabelle(modell) {
  const zeilen = [
    '| Block | Posten | Status | Fertig am | Nachweis | Gesichtet am | Vermerk |',
    '| --- | --- | --- | --- | --- | --- | --- |',
  ];
  for (const block of modell.bloecke) {
    for (const posten of block.posten) {
      if (posten.status === 'offen') continue;
      zeilen.push(
        `| ${block.id} | ${zelle(posten.name)} | ${posten.status} | ${zelle(posten.fertig_am)} | ` +
          `${zelle(posten.nachweis)} | ${zelle(posten.gesichtet_am)} | ${zelle(posten.vermerk)} |`,
      );
    }
  }
  return zeilen.join('\n');
}

/** Ersetzt den Bereich zwischen den Marken; wirft, wenn eine Marke fehlt. */
export function ersetzeTabelle(text, tabelle) {
  const anfang = text.indexOf(ANFANG);
  const ende = text.indexOf(ENDE);
  if (anfang < 0 || ende < anfang) {
    throw new Error('ROADMAP.md: Marken der Fortschrittstabelle fehlen oder stehen verkehrt.');
  }
  return `${text.slice(0, anfang + ANFANG.length)}\n${tabelle}\n${text.slice(ende)}`;
}

/** Steht in `text` genau die Tabelle, die das Modell ergibt? */
export function tabelleAktuell(text, modell) {
  try {
    return ersetzeTabelle(text, fortschrittTabelle(modell)) === text;
  } catch {
    return false;
  }
}
