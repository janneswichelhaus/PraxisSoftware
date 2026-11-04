import { ERSTE_ZIFFER, ZIFFERN_A } from './ean';

// Synthetische Barcodes für Tests und die Prüfseite: gerechnet, nie ein Foto (ADR-017 Punkt 41).

/** Die Module eines EAN-13 oder EAN-8 ohne Ruhezone, `true` ist ein Strich. */
export function eanModule(code: string): boolean[] {
  if (!/^(\d{8}|\d{13})$/.test(code)) throw new Error('EAN-8 oder EAN-13 erwartet');
  const module: boolean[] = [];
  const breiten = (b: readonly number[], strichZuerst: boolean) =>
    b.forEach((n, i) => {
      for (let k = 0; k < n; k += 1) module.push((i % 2 === 0) === strichZuerst);
    });
  const rand = () => breiten([1, 1, 1], true);
  const lang = code.length === 13;
  const links = lang ? code.slice(1, 7) : code.slice(0, 4);
  const rechts = lang ? code.slice(7) : code.slice(4);
  const satzB = lang ? (ERSTE_ZIFFER[Number(code.charAt(0))] ?? 0) : 0;
  rand();
  [...links].forEach((z, k) => {
    const a = ZIFFERN_A[Number(z)] ?? [];
    breiten(satzB & (1 << (5 - k)) ? [...a].reverse() : a, false);
  });
  breiten([1, 1, 1, 1, 1], false);
  [...rechts].forEach((z) => breiten(ZIFFERN_A[Number(z)] ?? [], true));
  rand();
  return module;
}

export interface Zeilenwahl {
  /** Pixel je Modul, auch gebrochen. */
  modul?: number;
  /** Ruhezone je Seite in Modulen. */
  ruhe?: number;
  hell?: number;
  dunkel?: number;
  /** Mittelung über so viele Pixel je Seite. */
  unschaerfe?: number;
  /** Größte Abweichung je Pixel, gleichverteilt aus `zufall`. */
  rauschen?: number;
  zufall?: () => number;
}

/** Eine Bildzeile mit dem Barcode: Helligkeiten von 0 bis 255. */
export function eanZeile(code: string, wahl: Zeilenwahl = {}): number[] {
  const { modul = 3, ruhe = 12, hell = 230, dunkel = 30, unschaerfe = 0, rauschen = 0 } = wahl;
  const zufall = wahl.zufall ?? Math.random;
  const module = [...Array<boolean>(ruhe).fill(false), ...eanModule(code)];
  module.push(...Array<boolean>(ruhe).fill(false));
  const breite = Math.round(module.length * modul);
  const roh = Array.from({ length: breite }, (_, x) =>
    module[Math.min(module.length - 1, Math.floor(x / modul))] ? dunkel : hell,
  );
  const weich = roh.map((_, x) => {
    let s = 0;
    let n = 0;
    for (let d = -unschaerfe; d <= unschaerfe; d += 1) {
      const w = roh[x + d];
      if (w !== undefined) {
        s += w;
        n += 1;
      }
    }
    return s / n;
  });
  return weich.map((w) =>
    Math.max(0, Math.min(255, Math.round(w + (zufall() * 2 - 1) * rauschen))),
  );
}

/** Ein Graubild `breite` × `hoehe`, der Barcode mittig, `balken` Pixel hoch. */
export function eanGraubild(
  code: string,
  breite: number,
  hoehe: number,
  wahl: Zeilenwahl & { balken?: number } = {},
): Uint8Array {
  const { balken = Math.round(hoehe / 2), hell = 230 } = wahl;
  const zeile = eanZeile(code, { ...wahl, hell });
  const bild = new Uint8Array(breite * hoehe).fill(hell);
  const links = Math.max(0, Math.floor((breite - zeile.length) / 2));
  const oben = Math.floor((hoehe - balken) / 2);
  for (let y = oben; y < oben + balken; y += 1) {
    zeile.forEach((w, x) => {
      if (links + x < breite) bild[y * breite + links + x] = w;
    });
  }
  return bild;
}

/** Ein Graubild als RGBA, wie es `getImageData` liefert. */
export function alsRgba(grau: Uint8Array, breite: number, hoehe: number) {
  const data = new Uint8ClampedArray(breite * hoehe * 4);
  grau.forEach((w, i) => {
    data.set([w, w, w, 255], i * 4);
  });
  return { data, width: breite, height: hoehe };
}
