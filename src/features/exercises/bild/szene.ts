import {
  HOEHE,
  MASSE,
  STRICH,
  plus,
  punkt,
  radius,
  umriss,
  winkelZu,
  type Figur,
  type P,
} from './figur';
import {
  STUFE_TIEFE,
  STUHL_TIEFE,
  figuren,
  flaecheBei,
  grundhoehe,
  koerperOrt,
  type Gegenstandslage,
  type Umgebung,
} from './loeser';
import type { BildHilfsmittel, Uebungsbild } from './schema';

/**
 * Aus Figuren eine Szene zum Zeichnen (ANN-381): Pfade aus Zahlen, Farben als
 * feste Rollen. Die Komponente `Uebungsbild` macht daraus SVG-Elemente - ohne
 * eine Zeichenkette aus den Daten.
 *
 * Die Welt hat y nach oben; das SVG nach unten. Umgedreht wird nur hier, in
 * `xy`.
 */

/** Farbrollen; die Klassen dazu stehen in `Uebungsbild.tsx`. */
export type Farbe = 'nah' | 'fern' | 'gegenstand' | 'band' | 'pfeil' | 'boden';

export interface Strich {
  d: string;
  breite: number;
  farbe: Farbe;
  /** Mit Füllung: in der Farbe selbst (Figur) oder hell (Gegenstand). */
  flaeche: boolean;
}

export interface Szene {
  /** `x y breite hoehe` im SVG-Koordinatensystem. */
  viewBox: string;
  boden: Strich;
  /** Was unter der Figur liegt: Möbel, Stufe, Kissen. */
  unten: Strich[];
  geist: Strich[];
  figur: Strich[];
  pfeile: Strich[];
}

export type Format = 'breit' | 'quadrat';

// -----------------------------------------------------------------------------
// Zahlen und Pfade
// -----------------------------------------------------------------------------

function z(v: number): string {
  const r = Math.round(v * 10) / 10;
  return String(Object.is(r, -0) ? 0 : r);
}

/** Ein Punkt im SVG: y umgedreht. */
function xy(p: P): string {
  return `${z(p[0])} ${z(-p[1])}`;
}

function linie(...punkte: P[]): string {
  return punkte.map((p, i) => `${i === 0 ? 'M' : 'L'}${xy(p)}`).join('');
}

function vieleck(...punkte: P[]): string {
  return `${linie(...punkte)}Z`;
}

function kurve(a: P, k: P, b: P): string {
  return `M${xy(a)}Q${xy(k)} ${xy(b)}`;
}

function kreis(c: P, r: number): string {
  return `M${z(c[0] - r)} ${z(-c[1])}a${z(r)} ${z(r)} 0 1 0 ${z(2 * r)} 0a${z(r)} ${z(r)} 0 1 0 ${z(-2 * r)} 0Z`;
}

function rechteck(x0: number, y0: number, x1: number, y1: number): string {
  return vieleck([x0, y0], [x1, y0], [x1, y1], [x0, y1]);
}

const strich = (d: string, breite: number, farbe: Farbe, flaeche = false): Strich => ({
  d,
  breite,
  farbe,
  flaeche,
});

// -----------------------------------------------------------------------------
// Die Figur
// -----------------------------------------------------------------------------

function glieder(f: Figur, i: 0 | 1, farbe: Farbe): { beine: Strich[]; arme: Strich[] } {
  const s = f.seiten[i];
  return {
    beine: [
      strich(linie(s.huefte, s.knie), STRICH.oberschenkel, farbe),
      strich(linie(s.knie, s.knoechel), STRICH.unterschenkel, farbe),
      strich(vieleck(s.knoechel, s.ferse, s.zehen), STRICH.fuss, farbe, true),
    ],
    arme: [
      strich(linie(s.schulterpunkt, s.ellbogen), STRICH.oberarm, farbe),
      strich(linie(s.ellbogen, s.hand), STRICH.unterarm, farbe),
    ],
  };
}

function kopfUndHals(f: Figur): Strich[] {
  return [
    strich(linie(f.schulter, f.hals), STRICH.hals, 'nah'),
    strich(kreis(f.kopf, MASSE.kopf), 0, 'nah', true),
  ];
}

export function figurStriche(f: Figur): Strich[] {
  if (f.ansicht === 'front') {
    const tr = 180 - f.stellung.rumpf;
    const quer = tr - 90;
    const liegt = Math.abs(f.stellung.rumpf) > 45;
    const links = glieder(f, 0, 'nah');
    const rechts = glieder(f, 1, liegt ? 'fern' : 'nah');
    const taille = plus(f.becken, MASSE.rumpf * 0.52, tr);
    const unten = plus(f.becken, -5, tr);
    const rumpf = vieleck(
      plus(f.schulter, -15, quer),
      plus(f.schulter, 15, quer),
      plus(taille, 11, quer),
      plus(f.becken, 12.5, quer),
      plus(unten, 10, quer),
      plus(unten, -10, quer),
      plus(f.becken, -12.5, quer),
      plus(taille, -11, quer),
    );
    return [
      ...(liegt ? [...rechts.beine, ...rechts.arme] : []),
      ...links.beine,
      ...(liegt ? [] : rechts.beine),
      strich(rumpf, 3, 'nah', true),
      ...links.arme,
      ...(liegt ? [] : rechts.arme),
      ...kopfUndHals(f),
    ];
  }
  const fern = glieder(f, 1, 'fern');
  const nah = glieder(f, 0, 'nah');
  const rumpf = f.bogen ? kurve(f.becken, f.bogen, f.schulter) : linie(f.becken, f.schulter);
  return [
    ...fern.arme,
    ...fern.beine,
    strich(rumpf, STRICH.rumpf, 'nah'),
    ...kopfUndHals(f),
    ...nah.beine,
    ...nah.arme,
  ];
}

// -----------------------------------------------------------------------------
// Gegenstände
// -----------------------------------------------------------------------------

const DICK = 3.2;

function gegenstand(g: Gegenstandslage, u: Umgebung, oben: number): Strich[] {
  const front = u.ansicht === 'front';
  const { x, zu } = g;
  switch (g.art) {
    case 'stuhl': {
      if (front) {
        return [
          strich(linie([x - 19, HOEHE.stuhlSitz], [x - 19, 0]), DICK, 'gegenstand'),
          strich(linie([x + 19, HOEHE.stuhlSitz], [x + 19, 0]), DICK, 'gegenstand'),
          strich(
            linie(
              [x - 19, HOEHE.stuhlSitz],
              [x - 19, HOEHE.stuhlLehne],
              [x + 19, HOEHE.stuhlLehne],
              [x + 19, HOEHE.stuhlSitz],
            ),
            DICK,
            'gegenstand',
          ),
          strich(
            rechteck(x - 23, HOEHE.stuhlSitz - 3, x + 23, HOEHE.stuhlSitz + 1),
            2,
            'gegenstand',
            true,
          ),
        ];
      }
      const vorn = x + zu * STUHL_TIEFE;
      return [
        strich(linie([x + zu * 2, HOEHE.stuhlSitz], [x + zu * 2, 0]), DICK, 'gegenstand'),
        strich(linie([vorn - zu * 2, HOEHE.stuhlSitz], [vorn - zu * 2, 0]), DICK, 'gegenstand'),
        strich(linie([x, HOEHE.stuhlSitz], [x - zu * 2, HOEHE.stuhlLehne]), 4, 'gegenstand'),
        strich(
          rechteck(x, HOEHE.stuhlSitz - 3.5, vorn, HOEHE.stuhlSitz + 0.5),
          2,
          'gegenstand',
          true,
        ),
      ];
    }
    case 'hocker':
      return [
        strich(linie([x - 13, HOEHE.hocker], [x - 13, 0]), DICK, 'gegenstand'),
        strich(linie([x + 13, HOEHE.hocker], [x + 13, 0]), DICK, 'gegenstand'),
        strich(
          rechteck(x - 16, HOEHE.hocker - 3.5, x + 16, HOEHE.hocker + 0.5),
          2,
          'gegenstand',
          true,
        ),
      ];
    case 'tisch': {
      const hinten = x + zu * 64;
      return [
        strich(rechteck(x + zu * 4, 0, hinten, HOEHE.tisch - 4), 2, 'gegenstand', true),
        strich(rechteck(x, HOEHE.tisch - 4, hinten, HOEHE.tisch), 2, 'gegenstand', true),
      ];
    }
    case 'wand': {
      const striche: Strich[] = [strich(linie([x, 0], [x, oben]), 3.5, 'gegenstand')];
      for (let y = 10; y < oben; y += 16) {
        striche.push(strich(linie([x, y], [x + zu * 7, y + 7]), 1.5, 'gegenstand'));
      }
      return striche;
    }
    case 'tuerrahmen':
      return [strich(rechteck(x - 3.5, 0, x + 3.5, Math.min(oben, 205)), 2, 'gegenstand', true)];
    case 'stufe': {
      const punkte: P[] = [[x, 0]];
      for (let n = 0; n < g.stufen; n += 1) {
        punkte.push([x + zu * n * STUFE_TIEFE, HOEHE.stufe * (n + 1)]);
        punkte.push([x + zu * (n + 1) * STUFE_TIEFE, HOEHE.stufe * (n + 1)]);
      }
      punkte.push([x + zu * g.stufen * STUFE_TIEFE, 0]);
      return [strich(vieleck(...punkte), 2, 'gegenstand', true)];
    }
  }
}

/** Wie weit ein Gegenstand den Bildausschnitt braucht. */
function gegenstandsumfang(g: Gegenstandslage, u: Umgebung): [number, number, number, number] {
  const { x, zu } = g;
  const spanne = (a: number, b: number) => [Math.min(a, b), Math.max(a, b)] as const;
  switch (g.art) {
    case 'stuhl': {
      if (u.ansicht === 'front') return [x - 24, 0, x + 24, HOEHE.stuhlLehne + 2];
      const [a, b] = spanne(x - zu * 4, x + zu * STUHL_TIEFE);
      return [a, 0, b, HOEHE.stuhlLehne + 2];
    }
    case 'hocker':
      return [x - 17, 0, x + 17, HOEHE.hocker + 1];
    case 'tisch': {
      const [a, b] = spanne(x, x + zu * 22);
      return [a, 0, b, HOEHE.tisch + 1];
    }
    case 'wand': {
      const [a, b] = spanne(x - zu * 2, x + zu * 8);
      return [a, 0, b, 0];
    }
    case 'tuerrahmen':
      return [x - 4, 0, x + 4, 0];
    case 'stufe': {
      const [a, b] = spanne(x, x + zu * g.stufen * STUFE_TIEFE);
      return [a, 0, b, HOEHE.stufe * g.stufen + 1];
    }
  }
}

// -----------------------------------------------------------------------------
// Was an der Figur hängt
// -----------------------------------------------------------------------------

function ankerAnGegenstand(u: Umgebung, art: string, ziel: P): P {
  const g = u.gegenstaende
    .filter((x) => x.art === art)
    .sort((a, b) => Math.abs(a.x - ziel[0]) - Math.abs(b.x - ziel[0]))[0];
  if (!g) return [ziel[0] + 60, ziel[1]];
  const hoehe = Math.max(4, Math.min(ziel[1], g.art === 'stuhl' ? HOEHE.stuhlSitz - 4 : 190));
  return [g.x, hoehe];
}

function anFigur(h: BildHilfsmittel, f: Figur, u: Umgebung): { unten: Strich[]; oben: Strich[] } {
  const unten: Strich[] = [];
  const oben: Strich[] = [];
  switch (h.art) {
    case 'kissen': {
      const p = punkt(f, h.an);
      const r = radius(f, h.an);
      const decke = Math.max(p[1] - r, flaecheBei(u, p[0]) + 6);
      unten.push(strich(rechteck(p[0] - 13, decke - 7, p[0] + 13, decke), 4, 'gegenstand', true));
      break;
    }
    case 'rolle': {
      const p = punkt(f, h.an);
      const r = radius(f, h.an);
      unten.push(strich(kreis([p[0], p[1] - r - 6.5], 6.5), 2, 'gegenstand', true));
      break;
    }
    case 'ball': {
      const p = koerperOrt(f, h.an);
      oben.push(strich(kreis(p, 10), 2, 'gegenstand', true));
      break;
    }
    case 'hantel': {
      const s = f.seiten[h.an === 'hand_nah' ? 0 : 1];
      const quer = winkelZu(s.ellbogen, s.hand) + 90;
      const a = plus(s.hand, -8, quer);
      const b = plus(s.hand, 8, quer);
      oben.push(strich(linie(a, b), 3, 'gegenstand'));
      oben.push(strich(linie(plus(a, -2.5, quer + 90), plus(a, 2.5, quer + 90)), 6, 'gegenstand'));
      oben.push(strich(linie(plus(b, -2.5, quer + 90), plus(b, 2.5, quer + 90)), 6, 'gegenstand'));
      break;
    }
    case 'manschette': {
      const s = f.seiten[h.an === 'knoechel_nah' ? 0 : 1];
      const w = winkelZu(s.knoechel, s.knie);
      oben.push(strich(linie(plus(s.knoechel, 3, w), plus(s.knoechel, 10, w)), 12, 'gegenstand'));
      break;
    }
    case 'stab': {
      const [a, b] = [f.seiten[1].hand, f.seiten[0].hand];
      const laenge = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (laenge < 6) {
        oben.push(strich(kreis(a, 3.5), 2, 'gegenstand', true));
      } else {
        const w = winkelZu(a, b);
        oben.push(strich(linie(plus(a, -16, w), plus(b, 16, w)), 3.5, 'gegenstand'));
      }
      break;
    }
    case 'band': {
      const nach = punkt(f, h.nach);
      const von =
        h.von === 'stuhl' ||
        h.von === 'tisch' ||
        h.von === 'wand' ||
        h.von === 'tuerrahmen' ||
        h.von === 'stufe' ||
        h.von === 'hocker'
          ? ankerAnGegenstand(u, h.von, nach)
          : punkt(f, h.von);
      oben.push(strich(linie(von, nach), 2.6, 'band'));
      break;
    }
    case 'handtuch': {
      oben.push(strich(linie(punkt(f, h.von), punkt(f, h.nach)), 4.5, 'gegenstand'));
      break;
    }
    case 'gehstock': {
      const hand = f.seiten[h.an === 'hand_nah' ? 0 : 1].hand;
      const fuss: P = [hand[0] + 5, flaecheBei(u, hand[0] + 5)];
      oben.push(strich(linie([hand[0] - 5, hand[1] + 1], hand, fuss), 3, 'gegenstand'));
      break;
    }
    default:
      break;
  }
  return { unten, oben };
}

function zubehoer(bild: Uebungsbild, f: Figur, u: Umgebung): { unten: Strich[]; oben: Strich[] } {
  const unten: Strich[] = [];
  const oben: Strich[] = [];
  for (const h of bild.hilfsmittel ?? []) {
    const teil = anFigur(h, f, u);
    unten.push(...teil.unten);
    oben.push(...teil.oben);
  }
  return { unten, oben };
}

// -----------------------------------------------------------------------------
// Der Pfeil
// -----------------------------------------------------------------------------

/** Kürzer als das wäre ein Pfeil nur ein Haken; er wird dann neben den Körper gelegt. */
const PFEIL_MINDESTENS = 26;

function pfeil(start: P, ziel: P, weg: P): Strich[] {
  let von = start;
  let nach = ziel;
  const roh = Math.hypot(nach[0] - von[0], nach[1] - von[1]);
  if (roh < 6) return [];
  const w = winkelZu(von, nach);
  if (roh < PFEIL_MINDESTENS) {
    // Ein kurzer Weg: gleiche Richtung, Mindestlänge, ein Stück vom Körper weg.
    const mitte: P = [(von[0] + nach[0]) / 2, (von[1] + nach[1]) / 2];
    const seiten = [plus(mitte, 15, w + 90), plus(mitte, 15, w - 90)] as [P, P];
    // Vom Körper weg; bei Gleichstand nach vorn, wohin die Figur blickt.
    const abstandZu = (p: P) =>
      Math.hypot(p[0] - weg[0], p[1] - weg[1]) + (p[0] > mitte[0] + 1 ? 5 : 0);
    const neben = abstandZu(seiten[0]) >= abstandZu(seiten[1]) ? seiten[0] : seiten[1];
    von = plus(neben, -PFEIL_MINDESTENS / 2, w);
    nach = plus(neben, PFEIL_MINDESTENS / 2, w);
  }
  const lang = Math.hypot(nach[0] - von[0], nach[1] - von[1]);
  const a = plus(von, 4, w);
  const b = plus(nach, -4, w);
  const mitte: P = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  // Gebogen, vom Körper weg.
  const kandidaten = [plus(mitte, lang * 0.22, w + 90), plus(mitte, lang * 0.22, w - 90)];
  const [k1, k2] = kandidaten as [P, P];
  const k =
    Math.hypot(k1[0] - weg[0], k1[1] - weg[1]) >= Math.hypot(k2[0] - weg[0], k2[1] - weg[1])
      ? k1
      : k2;
  const ende = winkelZu(k, b);
  const spitze = (d: number) => plus(b, -7, ende + d);
  return [
    strich(kurve(a, k, b), 2.6, 'pfeil'),
    strich(linie(spitze(28), b, spitze(-28)), 2.6, 'pfeil'),
  ];
}

// -----------------------------------------------------------------------------
// Bildausschnitt
// -----------------------------------------------------------------------------

export interface Ausschnitt {
  x0: number;
  /** Unterkante in Weltkoordinaten (unter dem Boden). */
  y0: number;
  breite: number;
  hoehe: number;
}

export function ausschnitt(figurenListe: Figur[], u: Umgebung, format: Format): Ausschnitt {
  const xs: number[] = [];
  const ys: number[] = [0];
  for (const f of figurenListe) {
    for (const [p, r] of umriss(f)) {
      xs.push(p[0] - r, p[0] + r);
      ys.push(p[1] + r);
    }
  }
  for (const g of u.gegenstaende) {
    const [a, , b, h] = gegenstandsumfang(g, u);
    xs.push(a, b);
    ys.push(h);
  }
  const rand = 9;
  let x0 = Math.min(...xs) - rand;
  let x1 = Math.max(...xs) + rand;
  const y0 = Math.min(0, grundhoehe(u)) - 7;
  let y1 = Math.max(...ys) + rand;
  const verhaeltnis = format === 'quadrat' ? 1 : 4 / 3;
  // Nicht zu nah heran: ein kleiner Ausschnitt würde die Figur aufblähen.
  if (x1 - x0 < 110) {
    const mehr = (110 - (x1 - x0)) / 2;
    x0 -= mehr;
    x1 += mehr;
  }
  const breite = x1 - x0;
  const hoehe = y1 - y0;
  if (breite / hoehe < verhaeltnis) {
    const mehr = hoehe * verhaeltnis - breite;
    x0 -= mehr / 2;
    x1 += mehr / 2;
  } else {
    y1 = y0 + breite / verhaeltnis;
  }
  return { x0, y0, breite: x1 - x0, hoehe: y1 - y0 };
}

function viewBox(a: Ausschnitt): string {
  return `${z(a.x0)} ${z(-(a.y0 + a.hoehe))} ${z(a.breite)} ${z(a.hoehe)}`;
}

// -----------------------------------------------------------------------------
// Die Szene
// -----------------------------------------------------------------------------

export type Darstellung = 'start' | 'ende' | 'bewegung' | 'vorschau';

function liegeflaeche(u: Umgebung, figurenListe: Figur[]): Strich[] {
  const xs = figurenListe.flatMap((f) => umriss(f).flatMap(([p, r]) => [p[0] - r, p[0] + r]));
  const von = Math.min(...xs) - 10;
  const bis = Math.max(...xs) + 10;
  if (u.unterlage === 'matte') {
    return [strich(rechteck(von, 0, bis, HOEHE.matte), 1.5, 'gegenstand', true)];
  }
  if (u.unterlage === 'bett') {
    return [
      strich(linie([von + 4, HOEHE.bett - 12], [von + 4, 0]), DICK, 'gegenstand'),
      strich(linie([bis - 4, HOEHE.bett - 12], [bis - 4, 0]), DICK, 'gegenstand'),
      strich(rechteck(von, HOEHE.bett - 12, bis, HOEHE.bett), 2, 'gegenstand', true),
    ];
  }
  return [];
}

function sitzbett(f: Figur): Strich[] {
  if (f.stellung.sitz !== 'bett') return [];
  const x = f.becken[0];
  return [
    strich(linie([x - 86, HOEHE.bett - 12], [x - 86, 0]), DICK, 'gegenstand'),
    strich(linie([x + 10, HOEHE.bett - 12], [x + 10, 0]), DICK, 'gegenstand'),
    strich(rechteck(x - 90, HOEHE.bett - 12, x + 14, HOEHE.bett), 2, 'gegenstand', true),
  ];
}

/** Die Szene einer Übung - für ein Einzelbild, die Bewegung oder die Vorschau. */
export function szene(bild: Uebungsbild, darstellung: Darstellung, einzeln?: Figur): Szene {
  const { start, ende, umgebung: u } = figuren(bild);
  const format: Format = darstellung === 'vorschau' ? 'quadrat' : 'breit';
  const a = ausschnitt([start, ende], u, format);
  const oben = a.y0 + a.hoehe;
  const haupt = einzeln ?? (darstellung === 'start' ? start : ende);
  const mitGeist = !einzeln && (darstellung === 'bewegung' || darstellung === 'vorschau');

  const unten: Strich[] = [
    ...liegeflaeche(u, [start, ende]),
    ...sitzbett(haupt),
    ...u.gegenstaende.flatMap((g) => gegenstand(g, u, oben)),
  ];
  const hauptZubehoer = zubehoer(bild, haupt, u);
  unten.push(...hauptZubehoer.unten);

  const geist: Strich[] = [];
  if (mitGeist) {
    const z2 = zubehoer(bild, start, u);
    geist.push(...figurStriche(start), ...z2.oben);
  }

  const pfeile: Strich[] = [];
  if (darstellung === 'bewegung' && !einzeln) {
    const mitte: P = [
      (ende.becken[0] + ende.schulter[0]) / 2,
      (ende.becken[1] + ende.schulter[1]) / 2,
    ];
    for (const ort of bild.bewegung ?? []) {
      pfeile.push(...pfeil(punkt(start, ort), punkt(ende, ort), mitte));
    }
  }

  return {
    viewBox: viewBox(a),
    boden: strich(linie([a.x0 + 3, 0], [a.x0 + a.breite - 3, 0]), 1.6, 'boden'),
    unten,
    geist,
    figur: [...figurStriche(haupt), ...hauptZubehoer.oben],
    pfeile,
  };
}
