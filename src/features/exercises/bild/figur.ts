import type { VolleStellung } from './grundstellungen';
import type { Ansicht, Koerperpunkt } from './schema';

/**
 * Die Rechnung hinter dem Übungsbild (ANN-381): aus Winkeln Punkte.
 *
 * Rein funktional und ohne DOM - testbar ohne Browser. Gerechnet wird in einem
 * Weltkoordinatensystem mit y nach oben, der Boden bei y = 0, eine Einheit
 * etwa ein Zentimeter. Erst die Szene (`szene.ts`) dreht y für das SVG um. Das Stellen in die
 * Szene - Löser, Anker, Griffe - steht in `loeser.ts`.
 *
 * Ablauf je Stellung:
 *   1. Grundstellung und Abweichungen zusammenführen;
 *   2. falls verlangt, einen Winkel so lösen, dass zwei Punkte gleich hoch
 *      aufliegen (Brücke, Vierfüßler);
 *   3. vorwärts rechnen, Griffe am eigenen Körper setzen (Zwei-Gelenk);
 *   4. waagerecht am Anker, senkrecht an Sitz, Stütze oder tiefstem Punkt
 *      ausrichten;
 *   5. Griffe an Gegenständen der Szene setzen (Lehne, Tisch, Wand, Stufe).
 */

export type P = readonly [number, number];

/** Segmentlängen, Fassung 1 - ein Erwachsener von etwa 1,75 m. */
export const MASSE = {
  rumpf: 50,
  hals: 7,
  kopf: 10,
  oberarm: 29,
  unterarm: 29,
  oberschenkel: 43,
  unterschenkel: 42,
  knoechel: 7,
  ferse: 5,
  zehen: 17,
  schulterbreite: 30,
  hueftbreite: 17,
} as const;

/** Strichstärken, Fassung 1. */
export const STRICH = {
  rumpf: 15,
  hals: 6.5,
  oberarm: 8,
  unterarm: 6.5,
  oberschenkel: 10.5,
  unterschenkel: 8.5,
  fuss: 5,
} as const;

/** Höhen der Gegenstände (Oberkante). */
export const HOEHE = {
  stuhlSitz: 44,
  stuhlLehne: 86,
  hocker: 44,
  bett: 46,
  matte: 2.5,
  tisch: 90,
  stufe: 17,
} as const;

const rad = (g: number) => (g * Math.PI) / 180;
const grad = (r: number) => (r * 180) / Math.PI;

/** Richtung eines Segments: 0 zeigt nach unten, 90 nach vorn (+x), 180 nach oben. */
export function richtung(g: number): P {
  return [Math.sin(rad(g)), -Math.cos(rad(g))];
}

export function plus(p: P, laenge: number, g: number): P {
  const d = richtung(g);
  return [p[0] + laenge * d[0], p[1] + laenge * d[1]];
}

/** Winkel der Richtung von a nach b in derselben Zählung. */
export function winkelZu(a: P, b: P): number {
  return grad(Math.atan2(b[0] - a[0], -(b[1] - a[1])));
}

export function abstand(a: P, b: P): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

/** Auf (-180, 180] gebracht. */
export function normal(g: number): number {
  let w = g % 360;
  if (w <= -180) w += 360;
  if (w > 180) w -= 360;
  return w;
}

// -----------------------------------------------------------------------------
// Die Figur
// -----------------------------------------------------------------------------

export interface Seite {
  /** Hüftgelenk (Seitenansicht: das Becken). */
  huefte: P;
  /** Schultergelenk (Seitenansicht: die Schulter). */
  schulterpunkt: P;
  knie: P;
  knoechel: P;
  sohle: P;
  ferse: P;
  zehen: P;
  ellbogen: P;
  hand: P;
}

export interface Figur {
  ansicht: Ansicht;
  becken: P;
  schulter: P;
  /** Mitte des Kopfes. */
  kopf: P;
  /** Ende des Halses, Ansatz des Kopfes. */
  hals: P;
  /** Kontrollpunkt der Wirbelsäule (Seitenansicht), sonst null. */
  bogen: P | null;
  /** 0 = nah (Front: links im Bild), 1 = fern (Front: rechts im Bild). */
  seiten: [Seite, Seite];
  /** Die Stellung, aus der die Figur entstand - nach Lösen und Griffen. */
  stellung: VolleStellung;
}

export const SEITEN = [0, 1] as const;
export const VORZEICHEN = [-1, 1] as const;

function vorwaertsSeite(s: VolleStellung): Figur {
  const becken: P = [0, 0];
  const tr = 180 - s.rumpf;
  const schulter = plus(becken, MASSE.rumpf, tr);
  const kopfRichtung = tr - s.wirbelsaeule / 2 - s.kopf;
  const hals = plus(schulter, MASSE.hals, kopfRichtung);
  const kopf = plus(schulter, MASSE.hals + MASSE.kopf, kopfRichtung);
  let bogen: P | null = null;
  if (Math.abs(s.wirbelsaeule) > 0.5) {
    const mitte: P = [(becken[0] + schulter[0]) / 2, (becken[1] + schulter[1]) / 2];
    // Kreisbogen mit dem Gesamtwinkel w: Der Kontrollpunkt einer quadratischen
    // Kurve liegt um Sehne · tan(w/4) neben der Mitte, nach hinten bei Beugung.
    bogen = plus(mitte, MASSE.rumpf * Math.tan(rad(s.wirbelsaeule / 4)), tr + 90);
  }
  const seite = (i: 0 | 1): Seite => {
    const ob = -s.rumpf + s.huefte[i];
    const knie = plus(becken, MASSE.oberschenkel, ob);
    const us = ob - s.knie[i];
    const knoechel = plus(knie, MASSE.unterschenkel, us);
    const fuss = s.fuss_flach[i] ? 90 : us + 90 - s.sprung[i];
    const sohle = plus(knoechel, MASSE.knoechel, fuss - 90);
    const ferse = plus(sohle, -MASSE.ferse, fuss);
    const zehen = plus(sohle, MASSE.zehen, fuss);
    const oa = -s.rumpf + s.schulter[i];
    const ellbogen = plus(schulter, MASSE.oberarm, oa);
    const hand = plus(ellbogen, MASSE.unterarm, oa + s.ellbogen[i]);
    return {
      huefte: becken,
      schulterpunkt: schulter,
      knie,
      knoechel,
      sohle,
      ferse,
      zehen,
      ellbogen,
      hand,
    };
  };
  return {
    ansicht: 'seite',
    becken,
    schulter,
    kopf,
    hals,
    bogen,
    seiten: [seite(0), seite(1)],
    stellung: s,
  };
}

function vorwaertsFront(s: VolleStellung): Figur {
  const becken: P = [0, 0];
  const tr = 180 - s.rumpf;
  const schulter = plus(becken, MASSE.rumpf, tr);
  const hals = plus(schulter, MASSE.hals, tr - s.kopf);
  const kopf = plus(schulter, MASSE.hals + MASSE.kopf, tr - s.kopf);
  const rechts = tr - 90;
  const seite = (i: 0 | 1): Seite => {
    const v = VORZEICHEN[i];
    const huefte = plus(becken, (v * MASSE.hueftbreite) / 2, rechts);
    const schulterpunkt = plus(schulter, (v * MASSE.schulterbreite) / 2, rechts);
    const ob = tr - 180 + v * s.bein[i];
    // Beugung zum Betrachter hin verkürzt das Bein in der Bildebene.
    const knie = plus(huefte, MASSE.oberschenkel * Math.cos(rad(s.huefte[i])), ob);
    const knoechel = plus(knie, MASSE.unterschenkel * Math.cos(rad(s.huefte[i] - s.knie[i])), ob);
    const sohle = plus(knoechel, MASSE.knoechel, ob);
    const aussen = rechts + (v < 0 ? 180 : 0);
    const ferse = plus(sohle, -3, aussen);
    const zehen = plus(sohle, 8, aussen);
    const oa = tr - 180 + v * s.arm[i];
    const ellbogen = plus(schulterpunkt, MASSE.oberarm, oa);
    const hand = plus(ellbogen, MASSE.unterarm, oa + v * s.ellbogen[i]);
    return { huefte, schulterpunkt, knie, knoechel, sohle, ferse, zehen, ellbogen, hand };
  };
  return {
    ansicht: 'front',
    becken,
    schulter,
    kopf,
    hals,
    bogen: null,
    seiten: [seite(0), seite(1)],
    stellung: s,
  };
}

export function vorwaerts(s: VolleStellung, ansicht: Ansicht): Figur {
  return ansicht === 'front' ? vorwaertsFront(s) : vorwaertsSeite(s);
}

// -----------------------------------------------------------------------------
// Punkte und ihre Ausdehnung
// -----------------------------------------------------------------------------

export function punkt(f: Figur, name: Koerperpunkt): P {
  const [nah, fern] = f.seiten;
  switch (name) {
    case 'becken':
      return f.becken;
    case 'schulter':
      return f.schulter;
    case 'kopf':
      return f.kopf;
    case 'knie_nah':
      return nah.knie;
    case 'knie_fern':
      return fern.knie;
    case 'knoechel_nah':
      return nah.knoechel;
    case 'knoechel_fern':
      return fern.knoechel;
    case 'ferse_nah':
      return nah.ferse;
    case 'ferse_fern':
      return fern.ferse;
    case 'zehen_nah':
      return nah.zehen;
    case 'zehen_fern':
      return fern.zehen;
    case 'ellbogen_nah':
      return nah.ellbogen;
    case 'ellbogen_fern':
      return fern.ellbogen;
    case 'hand_nah':
      return nah.hand;
    case 'hand_fern':
      return fern.hand;
  }
}

/** Wie weit ein Punkt über seine Mitte hinausreicht (halbe Strichstärke). */
export function radius(f: Figur, name: Koerperpunkt): number {
  if (name === 'becken' || name === 'schulter') {
    return f.ansicht === 'front' ? 6 : STRICH.rumpf / 2;
  }
  if (name === 'kopf') return MASSE.kopf;
  if (name.startsWith('knie')) return STRICH.oberschenkel / 2;
  if (name.startsWith('knoechel')) return STRICH.unterschenkel / 2;
  if (name.startsWith('ferse') || name.startsWith('zehen')) return STRICH.fuss / 2;
  if (name.startsWith('ellbogen')) return STRICH.oberarm / 2;
  return STRICH.unterarm / 2;
}

/** Punkte mit Ausdehnung - für den tiefsten Punkt und den Bildausschnitt. */
export function umriss(f: Figur): [P, number][] {
  const liste: [P, number][] = [
    [f.becken, f.ansicht === 'front' ? 12 : STRICH.rumpf / 2],
    [f.schulter, f.ansicht === 'front' ? 6 : STRICH.rumpf / 2],
    [f.kopf, MASSE.kopf],
  ];
  if (f.bogen) {
    // Die Kurve der Wirbelsäule: Punkte entlang der quadratischen Kurve.
    for (const t of [0.25, 0.5, 0.75]) {
      liste.push([bezier(f.becken, f.bogen, f.schulter, t), STRICH.rumpf / 2]);
    }
  }
  for (const s of f.seiten) {
    liste.push(
      [s.huefte, STRICH.oberschenkel / 2],
      [s.schulterpunkt, STRICH.oberarm / 2],
      [s.knie, STRICH.oberschenkel / 2],
      [s.knoechel, STRICH.unterschenkel / 2],
      [s.ferse, STRICH.fuss / 2],
      [s.zehen, STRICH.fuss / 2],
      [s.sohle, STRICH.fuss / 2],
      [s.ellbogen, STRICH.oberarm / 2],
      [s.hand, STRICH.unterarm / 2],
    );
  }
  if (f.ansicht === 'front') {
    // Die Flanken des Rumpfs.
    const tr = 180 - f.stellung.rumpf;
    for (const v of VORZEICHEN) {
      liste.push([plus(f.becken, v * 12, tr - 90), 2], [plus(f.schulter, v * 16, tr - 90), 2]);
    }
  }
  return liste;
}

export function bezier(a: P, k: P, b: P, t: number): P {
  const u = 1 - t;
  return [
    u * u * a[0] + 2 * u * t * k[0] + t * t * b[0],
    u * u * a[1] + 2 * u * t * k[1] + t * t * b[1],
  ];
}

export function unterkante(f: Figur, name: Koerperpunkt): number {
  return punkt(f, name)[1] - radius(f, name);
}

export function tiefster(f: Figur): number {
  return Math.min(...umriss(f).map(([p, r]) => p[1] - r));
}

export function verschiebe(f: Figur, dx: number, dy: number): Figur {
  const v = (p: P): P => [p[0] + dx, p[1] + dy];
  const s = (x: Seite): Seite => ({
    huefte: v(x.huefte),
    schulterpunkt: v(x.schulterpunkt),
    knie: v(x.knie),
    knoechel: v(x.knoechel),
    sohle: v(x.sohle),
    ferse: v(x.ferse),
    zehen: v(x.zehen),
    ellbogen: v(x.ellbogen),
    hand: v(x.hand),
  });
  return {
    ...f,
    becken: v(f.becken),
    schulter: v(f.schulter),
    kopf: v(f.kopf),
    hals: v(f.hals),
    bogen: f.bogen ? v(f.bogen) : null,
    seiten: [s(f.seiten[0]), s(f.seiten[1])],
  };
}

// -----------------------------------------------------------------------------
// Zwei-Gelenk-Rechnung
// -----------------------------------------------------------------------------

/**
 * Zwei Segmente von `a` aus, das Ende soll `ziel` erreichen. Liefert die
 * absoluten Winkel beider Segmente; `wahl` entscheidet zwischen den beiden
 * Lösungen (Ellbogen und Knie beugen nur in eine Richtung).
 */
export function zweiGelenk(
  a: P,
  ziel: P,
  l1: number,
  l2: number,
  wahl: (w1: number, w2: number) => number,
): [number, number] {
  const d = Math.min(Math.max(abstand(a, ziel), Math.abs(l1 - l2) + 0.01), l1 + l2 - 0.01);
  const zumZiel = winkelZu(a, ziel);
  const cos = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d);
  const alpha = grad(Math.acos(Math.min(1, Math.max(-1, cos))));
  const loesungen = [zumZiel - alpha, zumZiel + alpha].map((w1): [number, number] => {
    const gelenk = plus(a, l1, w1);
    return [w1, winkelZu(gelenk, ziel)];
  });
  const [x, y] = loesungen as [[number, number], [number, number]];
  return wahl(x[0], x[1]) >= wahl(y[0], y[1]) ? x : y;
}

/** Beugung in [0, 180] bevorzugt: je näher, desto besser. */
export function beugungsguete(beugung: number): number {
  const b = normal(beugung);
  return b >= -2 && b <= 182 ? 1000 - Math.abs(b - 60) : -Math.abs(b);
}
