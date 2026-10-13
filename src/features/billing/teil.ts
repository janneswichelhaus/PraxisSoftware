/**
 * Der offene Teil eines Objekts ohne eigene Routen (`Teilreiter`). Eigene
 * Datei aus demselben Grund wie `buttonStile.ts`: Eine Datei mit Komponente
 * und Hilfsfunktion hebelt das schnelle Neuladen aus.
 */
export interface Teil<W extends string> {
  wert: W;
  label: string;
}

/** Der Suchparameter, der den offenen Teil trägt. */
export const TEIL_PARAM = 'teil';

/**
 * Welcher Teil offen ist: der Wert aus der Adresse, wenn es ihn gibt, sonst
 * der erste.
 */
export function offenerTeil<W extends string>(
  suche: URLSearchParams,
  teile: readonly Teil<W>[],
): W | undefined {
  const wert = suche.get(TEIL_PARAM);
  return teile.find((teil) => teil.wert === wert)?.wert ?? teile[0]?.wert;
}
