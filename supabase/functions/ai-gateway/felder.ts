// Felder vom Foto als Bauart (ANN-861): Der Adapter schreibt ab und nennt Stellen; den Wert
// schneidet der Gateway aus der erkannten Zeile. Ein Wert, der dort nicht steht, hat keinen Platz.

/** Die erkannten Zeilen ohne Leerzeilen - `null`, wenn die Antwort des Adapters nicht taugt. */
export function erkannteZeilen(
  wert: unknown,
  hoechstZeilen: number,
  hoechstZeichen: number,
): string[] | null {
  if (!Array.isArray(wert)) return null;
  const zeilen: string[] = [];
  for (const zeile of wert as unknown[]) {
    if (typeof zeile !== 'string' || /[\r\n]/.test(zeile)) return null;
    const inhalt = zeile.trim();
    if (inhalt.length > hoechstZeichen) return null;
    if (inhalt !== '') zeilen.push(inhalt);
  }
  return zeilen.length > hoechstZeilen ? null : zeilen;
}

/** Ein vorgeschlagener Wert mit der Zeile, aus der er ausgeschnitten ist. */
export interface Feldwert {
  readonly feld: string;
  readonly wert: string;
  readonly zeile: string;
}

/**
 * ANN-861: je Fundstelle der Wortlaut aus ihrer Zeile, geordnet nach Feld und Zeile. `null`, wenn
 * ein Feld unbekannt ist, eine Stelle nicht im Text liegt, leer ist, doppelt oder zu oft vorkommt.
 */
export function setzeFelder(
  zeilen: readonly string[],
  fundstellen: unknown,
  felder: Readonly<Record<string, number>>,
): Feldwert[] | null {
  if (!Array.isArray(fundstellen)) return null;
  const grenzen = new Map(Object.entries(felder));
  const jeFeld = new Map<string, { wert: string; zeile: number; von: number }[]>();
  for (const stelle of fundstellen as unknown[]) {
    if (typeof stelle !== 'object' || stelle === null) return null;
    const { feld, zeile, von, bis } = stelle as Record<string, unknown>;
    const grenze = typeof feld === 'string' ? grenzen.get(feld) : undefined;
    if (grenze === undefined || typeof feld !== 'string') return null;
    if (!Number.isInteger(zeile) || !Number.isInteger(von) || !Number.isInteger(bis)) return null;
    const [nummer, anfang, ende] = [zeile as number, von as number, bis as number];
    const text = nummer >= 0 ? zeilen[nummer] : undefined;
    if (text === undefined || anfang < 0 || ende <= anfang || ende > text.length) return null;
    const wert = text.slice(anfang, ende).trim();
    const liste = jeFeld.get(feld) ?? [];
    if (wert === '' || liste.length >= grenze) return null;
    if (liste.some((vorhanden) => vorhanden.zeile === nummer && vorhanden.von === anfang))
      return null;
    jeFeld.set(feld, [...liste, { wert, zeile: nummer, von: anfang }]);
  }
  return [...grenzen.keys()].flatMap((feld) =>
    [...(jeFeld.get(feld) ?? [])]
      .sort((a, b) => a.zeile - b.zeile || a.von - b.von)
      .map(({ wert, zeile }) => ({ feld, wert, zeile: zeilen[zeile]! })),
  );
}
