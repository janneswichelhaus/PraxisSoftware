import { MARKE_SEITENVERHAELTNIS } from '@/components/ui/markeRegeln';

/**
 * Takt, Kurven und Geometrie des Startbilds „Speiche wird O" (Handoff Rahmen
 * vom 2026-10-05, Abschnitt 6; RAH-009) - alles, was keine Komponente ist.
 *
 * Eigene Datei aus demselben Grund wie `buttonStile.ts`: Eine Modul-Datei mit
 * Komponente *und* Konstanten hebelt das schnelle Neuladen aus
 * (`react-refresh`). Die Zahlen hier sind prüfbar, ohne etwas zu zeichnen.
 */

/** Ende der sechs Bilder in Sekunden (Handoff, Tabelle „Szenen und Dauern"). */
export const BILDENDE = {
  papier: 0.12,
  rad: 0.68,
  speiche: 1.04,
  buchstaben: 1.34,
  wortmarke: 1.48,
  abgang: 1.8,
} as const;

export const STARTBILD_DAUER = BILDENDE.abgang;

/** Mit reduzierter Bewegung: Fläche, Marke ab 0,16 s, Schnitt bei 0,3 s. */
export const REDUZIERT_MARKE_AB = 0.16;
export const REDUZIERT_DAUER = 0.3;

export type Bild = 1 | 2 | 3 | 4 | 5 | 6;

/** Welches Bild zu einer Zeit läuft (Cue-Tabelle). */
export function bildZu(t: number): Bild {
  if (t < BILDENDE.papier) return 1;
  if (t < BILDENDE.rad) return 2;
  if (t < BILDENDE.speiche) return 3;
  if (t < BILDENDE.buchstaben) return 4;
  if (t < BILDENDE.wortmarke) return 5;
  return 6;
}

/**
 * Die zwei Kurven des Intros: `ankommen` (.2,.7,.2,1) für Ankommen und
 * Erscheinen, `verwandeln` (.65,0,.35,1) für Verwandlung und Abgang. Ein
 * kubischer Bézier wie in CSS, nach x aufgelöst (Newton).
 */
function bezier(x1: number, y1: number, x2: number, y2: number): (p: number) => number {
  const a = (a1: number, a2: number) => 1 - 3 * a2 + 3 * a1;
  const b = (a1: number, a2: number) => 3 * a2 - 6 * a1;
  const c = (a1: number) => 3 * a1;
  const wert = (s: number, a1: number, a2: number) => ((a(a1, a2) * s + b(a1, a2)) * s + c(a1)) * s;
  const steigung = (s: number, a1: number, a2: number) =>
    3 * a(a1, a2) * s * s + 2 * b(a1, a2) * s + c(a1);
  return (p: number) => {
    if (p <= 0) return 0;
    if (p >= 1) return 1;
    let s = p;
    for (let i = 0; i < 8; i += 1) {
      const st = steigung(s, x1, x2);
      if (st === 0) break;
      s -= (wert(s, x1, x2) - p) / st;
    }
    s = Math.min(1, Math.max(0, s));
    return wert(s, y1, y2);
  };
}

export const ankommen = bezier(0.2, 0.7, 0.2, 1);
export const verwandeln = bezier(0.65, 0, 0.35, 1);

/** Anteil 0..1 eines Abschnitts von `von` bis `bis`, außerhalb gekappt. */
export function anteil(t: number, von: number, bis: number): number {
  return Math.min(1, Math.max(0, (t - von) / (bis - von)));
}

/**
 * Geometrie der 640er Marke (Handoff, „Geometrie je Gerät"; nachgemessen an
 * `marke/logo/own-motion-block-farbig.svg`, Pfadraum × 640 / 5330,93). Alle
 * Werte skalieren mit dem Maßstab des Geräts.
 */
export const MARKE_640 = {
  breite: 640,
  hoehe: 640 / MARKE_SEITENVERHAELTNIS,
  /** Das O der ersten Zeile: Mitte und Außenmaß. */
  oMitteX: 65.35,
  oMitteY: 70.8,
  oRechts: 130.7,
  oUnten: 141.6,
  /** Die Felge wird das O: Ellipse auf der Mittellinie des Rings, Strich 27,5. */
  oRx: 51.45,
  oRy: 57.5,
  oStrich: 27.5,
  radRadius: 68,
  radStrich: 2.5,
  speichen: 14,
  nabe: 7,
  /** Buchstabenbereiche für `clip-path`. */
  w: [139.8, 326.9] as const,
  n: [341.4, 451.4] as const,
  zeile1Unten: 138.3,
  motionOben: 156.6,
  motionLinks: 150.7,
  /** Rechter Rand des M von MOTION. */
  mRechts: 239.0,
} as const;

export type Geraet = 'handy' | 'tablet' | 'pc';

/** Breite der Marke mittig je Gerät (Handoff, Tabelle „Geometrie je Gerät"). */
const MARKENBREITE: Record<Geraet, number> = { handy: 300, tablet: 420, pc: 640 };

export function geraetFuer(fensterbreite: number): Geraet {
  if (fensterbreite < 640) return 'handy';
  if (fensterbreite < 1024) return 'tablet';
  return 'pc';
}

/** Ein Rechteck, in dem die Marke (640er Verhältnis) steht. */
export interface Lage {
  x: number;
  y: number;
  breite: number;
}

/** Breite der Seitenleiste ab 1024 px (`AppShell`, `lg:w-62`). */
export const SEITENLEISTE = 248;
/** Die Kachel des Monogramms in der Symbolspalte: 40 px, Radius wie das Master. */
export const KACHEL = 40;
export const KACHEL_RADIUS = (149.3333 / 1024) * KACHEL;

/**
 * Wo O und M im Master liegen (`own-motion-monogramm.svg`, 1024er Kachel):
 * eine Gruppe bei 122,88 / 330,82 im Maßstab 0,4957, darin das O auf 0..675
 * und das M auf 834..1570, 17 tiefer. Hier in Pixeln der 40er Kachel.
 *
 * Das Monogramm sind **das O der ersten Zeile und das M von MOTION**
 * (`marke/README.md`): Genau die zwei Buchstaben, die das Intro zuerst
 * zeichnet - das Rad wird das O, MOTION beginnt mit dem M. Beide stehen in
 * der Marke verschieden groß und übereinander; in der Kachel stehen sie
 * gleich hoch nebeneinander. Deshalb zwei Bilder mit je eigenem Weg.
 */
const MONOGRAMM_MASS = (0.4957 * KACHEL) / 1024;
export const MONOGRAMM = {
  links: (122.88 / 1024) * KACHEL,
  oben: (330.8237 / 1024) * KACHEL,
  o: { x: 0, y: 0, breite: 675 * MONOGRAMM_MASS },
  m: { x: 834 * MONOGRAMM_MASS, y: 17 * MONOGRAMM_MASS, breite: 736 * MONOGRAMM_MASS },
} as const;

/** Die Lagen der ganzen Marke, bei denen O bzw. M genau in der Kachel liegen. */
export function monogrammLagen(kachel: Lage): { o: Lage; m: Lage } {
  const kO = MONOGRAMM.o.breite / MARKE_640.oRechts;
  const kM = MONOGRAMM.m.breite / (MARKE_640.mRechts - MARKE_640.motionLinks);
  return {
    o: {
      x: kachel.x + MONOGRAMM.links + MONOGRAMM.o.x,
      y: kachel.y + MONOGRAMM.oben + MONOGRAMM.o.y,
      breite: kO * MARKE_640.breite,
    },
    m: {
      x: kachel.x + MONOGRAMM.links + MONOGRAMM.m.x - MARKE_640.motionLinks * kM,
      y: kachel.y + MONOGRAMM.oben + MONOGRAMM.m.y - MARKE_640.motionOben * kM,
      breite: kM * MARKE_640.breite,
    },
  };
}

/**
 * Wo die Marke landet (Bild 6). Gemessen am Rahmen, wenn er schon steht -
 * `data-startbild-ziel` an den Marken-Links in `AppShell` -, sonst die Maße
 * des Rahmens: Kopfzeile links 16, oben 16, 24 hoch; Symbolspalte Kachel
 * mittig in 84 bei 22/30; Seitenleiste links 32, oben 32, 36 hoch. Am Tablet
 * ist das Ergebnis die Kachel selbst (`breite` = 40), nicht die Marke.
 */
export function landeplatz(geraet: Geraet): Lage {
  // Kopfzeile unter 640 px, sonst der Marken-Link der Seitenleiste - darin
  // Wortmarke und Monogramm, von denen CSS je Breite eines zeigt.
  const kennung = geraet === 'handy' ? 'kopfzeile' : 'seitenleiste';
  const bilder = document.querySelectorAll<HTMLElement>(`[data-startbild-ziel="${kennung}"] img`);
  const rect = Array.from(bilder)
    .map((bild) => bild.getBoundingClientRect())
    .find((r) => r.width > 0);
  if (rect) {
    if (geraet === 'tablet') return { x: rect.left, y: rect.top, breite: KACHEL };
    return { x: rect.left, y: rect.top, breite: rect.width };
  }
  if (geraet === 'handy') return { x: 16, y: 16, breite: 24 * MARKE_SEITENVERHAELTNIS };
  if (geraet === 'tablet') return { x: 22, y: 30, breite: KACHEL };
  return { x: 32, y: 32, breite: 36 * MARKE_SEITENVERHAELTNIS };
}

/** Die Marke mittig im Fenster, in der Breite des Geräts (höchstens Fenster − 32). */
export function mitte(geraet: Geraet, fensterbreite: number, fensterhoehe: number): Lage {
  const breite = Math.min(MARKENBREITE[geraet], fensterbreite - 32);
  const hoehe = breite / MARKE_SEITENVERHAELTNIS;
  return { x: (fensterbreite - breite) / 2, y: (fensterhoehe - hoehe) / 2, breite };
}

export function zwischen(von: Lage, bis: Lage, p: number): Lage {
  return {
    x: von.x + (bis.x - von.x) * p,
    y: von.y + (bis.y - von.y) * p,
    breite: von.breite + (bis.breite - von.breite) * p,
  };
}

/** Ein Ausschnitt der Marke in 640er Koordinaten: links, rechts, oben, unten. */
export type Ausschnitt = readonly [number, number, number, number];

export const AUSSCHNITT = {
  w: [MARKE_640.w[0], MARKE_640.w[1], 0, MARKE_640.zeile1Unten] as Ausschnitt,
  n: [MARKE_640.n[0], MARKE_640.n[1], 0, MARKE_640.zeile1Unten] as Ausschnitt,
  motion: [
    MARKE_640.motionLinks,
    MARKE_640.breite,
    MARKE_640.motionOben,
    MARKE_640.hoehe,
  ] as Ausschnitt,
  /** Das O der ersten Zeile und das M von MOTION - das Monogramm. */
  o: [0, MARKE_640.oRechts, 0, MARKE_640.oUnten] as Ausschnitt,
  m: [
    MARKE_640.motionLinks,
    MARKE_640.mRechts,
    MARKE_640.motionOben,
    MARKE_640.hoehe,
  ] as Ausschnitt,
} as const;

/** `clip-path: inset(…)` für einen Ausschnitt, wahlweise nur bis `bisRechts` aufgedeckt. */
export function clip(
  [links, rechts, oben, unten]: Ausschnitt,
  k: number,
  bisRechts = rechts,
): string {
  const r = MARKE_640.breite - bisRechts;
  const u = MARKE_640.hoehe - unten;
  return `inset(${oben * k}px ${r * k}px ${u * k}px ${links * k}px)`;
}

/** Alles außer O und M: W und N, dazu OTION - zwei Ausschnitte, deshalb zwei Bilder. */
export function clipRest(k: number): [string, string] {
  return [
    `inset(0px 0px ${(MARKE_640.hoehe - MARKE_640.zeile1Unten) * k}px ${MARKE_640.w[0] * k}px)`,
    `inset(${MARKE_640.motionOben * k}px 0px 0px ${MARKE_640.mRechts * k}px)`,
  ];
}
