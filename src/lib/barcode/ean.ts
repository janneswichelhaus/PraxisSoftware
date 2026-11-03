import { gtinGueltig } from './gtin';

// Ein Leser für EAN-13, EAN-8 und UPC-A (als EAN-13 mit 0 vorn) aus Bildzeilen, nach dem Verfahren
// der Zeilenleser von ZXing; ohne Bibliothek und ohne WebAssembly, weil die CSP nur `script-src
// 'self'` erlaubt. Gelesen wird im Arbeitsspeicher, nichts wird aufbewahrt (ADR-027 Punkt 10).

/** Breiten der Ziffern in Modulen (Lücke, Strich, Lücke, Strich), Zeichensatz A der Norm. */
export const ZIFFERN_A: readonly (readonly number[])[] = [
  [3, 2, 1, 1],
  [2, 2, 2, 1],
  [2, 1, 2, 2],
  [1, 4, 1, 1],
  [1, 1, 3, 2],
  [1, 2, 3, 1],
  [1, 1, 1, 4],
  [1, 3, 1, 2],
  [1, 2, 1, 3],
  [3, 1, 1, 2],
];

/** Zeichensatz B ist A rückwärts; links stehen A und B gemischt. */
const A_UND_B = [...ZIFFERN_A, ...ZIFFERN_A.map((m) => [...m].reverse())];

/** Welche der sechs linken Stellen aus Satz B kommen (Bit 5 = erste Stelle), je erster Ziffer. */
export const ERSTE_ZIFFER = [0x00, 0x0b, 0x0d, 0x0e, 0x13, 0x19, 0x1c, 0x15, 0x16, 0x1a] as const;

const RAND = [1, 1, 1];
const MITTE = [1, 1, 1, 1, 1];
const MAX_MITTEL = 0.48;
const MAX_EINZELN = 0.7;

/** Mittlere Abweichung der Läufe vom Muster je Pixel, `Infinity`, wenn ein Lauf zu weit abweicht. */
function abweichung(laeufe: readonly number[], muster: readonly number[]): number {
  let summe = 0;
  for (const l of laeufe) summe += l;
  let module = 0;
  for (const m of muster) module += m;
  if (summe < module) return Infinity;
  const einheit = summe / module;
  const grenze = MAX_EINZELN * einheit;
  let gesamt = 0;
  for (let i = 0; i < muster.length; i += 1) {
    const v = Math.abs((laeufe[i] ?? 0) - (muster[i] ?? 0) * einheit);
    if (v > grenze) return Infinity;
    gesamt += v;
  }
  return gesamt / summe;
}

/** Die passendste Ziffer aus den Mustern oder -1. */
function ziffer(laeufe: readonly number[], muster: readonly (readonly number[])[]): number {
  let beste = MAX_MITTEL;
  let index = -1;
  muster.forEach((m, i) => {
    const v = abweichung(laeufe, m);
    if (v < beste) {
      beste = v;
      index = i;
    }
  });
  return index;
}

function summe(werte: readonly number[]): number {
  return werte.reduce((a, b) => a + b, 0);
}

/** Ziffern ab Lauf `p`, danach Mitte, Ziffern und Rand mit heller Ruhezone; sonst `null`. */
function symbol(laengen: readonly number[], p: number, links: number): string | null {
  const rechts = links;
  let ziffern = '';
  let satzB = 0;
  for (let k = 0; k < links; k += 1, p += 4) {
    const laeufe = laengen.slice(p, p + 4);
    if (laeufe.length < 4) return null;
    const i = ziffer(laeufe, links === 6 ? A_UND_B : ZIFFERN_A);
    if (i < 0) return null;
    ziffern += String(i % 10);
    if (i >= 10) satzB |= 1 << (5 - k);
  }
  const mitte = laengen.slice(p, p + 5);
  if (mitte.length < 5 || abweichung(mitte, MITTE) >= MAX_MITTEL) return null;
  p += 5;
  for (let k = 0; k < rechts; k += 1, p += 4) {
    const laeufe = laengen.slice(p, p + 4);
    if (laeufe.length < 4) return null;
    const i = ziffer(laeufe, ZIFFERN_A);
    if (i < 0) return null;
    ziffern += String(i);
  }
  const ende = laengen.slice(p, p + 3);
  if (ende.length < 3 || abweichung(ende, RAND) >= MAX_MITTEL) return null;
  const ruhe = laengen[p + 3];
  if (ruhe === undefined || ruhe < summe(ende)) return null;
  let code = ziffern;
  if (links === 6) {
    const erste = ERSTE_ZIFFER.indexOf(satzB as (typeof ERSTE_ZIFFER)[number]);
    if (erste < 0) return null;
    code = `${erste}${ziffern}`;
  }
  return gtinGueltig(code) ? code : null;
}

/** Hell und dunkel einer Zeile über das Tal zwischen den beiden Gipfeln der Helligkeiten. */
function schwarzpunkt(faecher: readonly number[]): number {
  let erste = 0;
  let hoechste = 0;
  faecher.forEach((f, x) => {
    if (f > hoechste) {
      hoechste = f;
      erste = x;
    }
  });
  let zweite = 0;
  let zweiteWert = 0;
  faecher.forEach((f, x) => {
    const w = f * (x - erste) * (x - erste);
    if (w > zweiteWert) {
      zweiteWert = w;
      zweite = x;
    }
  });
  const [a, b] = erste < zweite ? [erste, zweite] : [zweite, erste];
  if (b - a <= faecher.length / 16) return -1;
  let tal = b - 1;
  let talWert = -1;
  for (let x = b - 1; x > a; x -= 1) {
    const w = (x - a) * (x - a) * (b - x) * (hoechste - (faecher[x] ?? 0));
    if (w > talWert) {
      talWert = w;
      tal = x;
    }
  }
  return tal << 3;
}

/** Die Schwelle zwischen hell und dunkel einer Zeile oder -1 ohne Kontrast. */
function schwelle(werte: ArrayLike<number>): number {
  const faecher = new Array<number>(32).fill(0);
  for (let i = 0; i < werte.length; i += 1) {
    const f = (werte[i] ?? 0) >> 3;
    faecher[f] = (faecher[f] ?? 0) + 1;
  }
  return schwarzpunkt(faecher);
}

type Laeufe = { laengen: number[]; ersteDunkel: boolean };
type Art = 'scharf' | 'glatt' | 'oertlich';

/** Hell oder dunkel je Pixel als Läufe; `null` ohne Kontrast. */
function alsLaeufe(dunkel: (x: number) => boolean, n: number): Laeufe {
  const laengen: number[] = [];
  const ersteDunkel = dunkel(0);
  let jetzt = ersteDunkel;
  let lauf = 0;
  for (let x = 0; x < n; x += 1) {
    const d = dunkel(x);
    if (d === jetzt) lauf += 1;
    else {
      laengen.push(lauf);
      jetzt = d;
      lauf = 1;
    }
  }
  laengen.push(lauf);
  return { laengen, ersteDunkel };
}

/**
 * Die Läufe einer Zeile: `scharf` hebt Kanten an (-1, 4, -1, wie ZXing), `glatt` mittelt (1, 2, 1)
 * gegen Rauschen, `oertlich` misst die Schwelle im Fenster gegen ungleiches Licht.
 */
export function zeileInLaeufen(werte: ArrayLike<number>, art: Art): Laeufe | null {
  const n = werte.length;
  const schwarz = schwelle(werte);
  if (n < 3 || schwarz < 0) return null;
  const w = (x: number) => werte[Math.max(0, Math.min(n - 1, x))] ?? 0;
  if (art !== 'oertlich') {
    return alsLaeufe((x) => {
      const nachbarn = w(x - 1) + w(x + 1);
      const v = art === 'scharf' ? (w(x) * 4 - nachbarn) / 2 : (w(x) * 2 + nachbarn) / 4;
      return v < schwarz;
    }, n);
  }
  const glatt = Array.from({ length: n }, (_, x) => (w(x - 1) + 2 * w(x) + w(x + 1)) / 4);
  const halb = Math.max(16, Math.round(n / 20));
  // Ohne Kontrast im Fenster ist es hell: die Ruhezone neben dem Barcode und der Grund.
  const mindestens = Math.max(24, (255 - schwarz) / 4);
  return alsLaeufe((x) => {
    let min = 255;
    let max = 0;
    for (let k = Math.max(0, x - halb); k <= Math.min(n - 1, x + halb); k += 1) {
      const v = glatt[k] ?? 0;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    return max - min >= mindestens && (glatt[x] ?? 0) < (min + max) / 2;
  }, n);
}

/** Dieselben Läufe von rechts gelesen. */
function rueckwaerts({ laengen, ersteDunkel }: Laeufe): Laeufe {
  const letzteDunkel = laengen.length % 2 === 1 ? ersteDunkel : !ersteDunkel;
  return { laengen: [...laengen].reverse(), ersteDunkel: letzteDunkel };
}

function suchen(zeile: Laeufe): string | null {
  const { laengen, ersteDunkel } = zeile;
  for (let s = ersteDunkel ? 2 : 1; s + 3 <= laengen.length; s += 2) {
    const rand = laengen.slice(s, s + 3);
    if (abweichung(rand, RAND) >= MAX_MITTEL) continue;
    // Ruhezone links: der helle Lauf davor mindestens so breit wie der Rand.
    if ((laengen[s - 1] ?? 0) < summe(rand)) continue;
    const code = symbol(laengen, s + 3, 6) ?? symbol(laengen, s + 3, 4);
    if (code) return code;
  }
  return null;
}

/** Der erste gültige EAN-13 oder EAN-8 einer Zeile, vorwärts oder rückwärts gelesen. */
export function eanAusZeile(werte: ArrayLike<number>): string | null {
  for (const art of ['scharf', 'glatt', 'oertlich'] as const) {
    const zeile = zeileInLaeufen(werte, art);
    if (!zeile) return null;
    const code = suchen(zeile) ?? suchen(rueckwaerts(zeile));
    if (code) return code;
  }
  return null;
}

/** Ein Bild wie `ImageData`: RGBA, Zeile für Zeile. */
export interface Rgbabild {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/**
 * Codes aus bis zu `zeilen` Zeilen im mittleren `anteil` der Höhe, von der Mitte nach außen; die
 * Zahl sagt, wie oft ein Code gelesen wurde.
 */
export function eanAusBild(bild: Rgbabild, zeilen = 24, anteil = 0.6): Map<string, number> {
  const { data, width: breite, height: hoehe } = bild;
  const treffer = new Map<string, number>();
  const schritt = Math.max(1, Math.floor((hoehe * anteil) / zeilen));
  const grau = new Uint8Array(breite);
  for (let i = 0; i < zeilen; i += 1) {
    const y = (hoehe >> 1) + ((i + 1) >> 1) * schritt * (i % 2 === 0 ? 1 : -1);
    if (y < 0 || y >= hoehe) continue;
    for (let x = 0, j = y * breite * 4; x < breite; x += 1, j += 4) {
      grau[x] = ((data[j] ?? 0) + 2 * (data[j + 1] ?? 0) + (data[j + 2] ?? 0)) >> 2;
    }
    const code = eanAusZeile(grau);
    if (code) treffer.set(code, (treffer.get(code) ?? 0) + 1);
  }
  return treffer;
}
