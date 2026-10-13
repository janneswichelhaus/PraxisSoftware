import {
  HOEHE,
  MASSE,
  SEITEN,
  STRICH,
  VORZEICHEN,
  beugungsguete,
  normal,
  plus,
  punkt,
  radius,
  tiefster,
  unterkante,
  verschiebe,
  vorwaerts,
  winkelZu,
  zweiGelenk,
  type Figur,
  type P,
} from './figur';
import { GRUND, type Paar, type VolleStellung } from './grundstellungen';
import type {
  Ansicht,
  BildHilfsmittel,
  Gegenstand,
  Koerperpunkt,
  Sitz,
  Stellung,
  Uebungsbild,
  Unterlage,
} from './schema';

/**
 * Eine Stellung in die Szene stellen (ANN-381): Löser, Anker, Stütze, Griffe.
 *
 * Die Gegenstände stehen fest, die Figur wird an ihnen ausgerichtet:
 * waagerecht am Anker (bleibt zwischen Start und Ende stehen), senkrecht am
 * Sitz, an der Stütze oder mit dem tiefsten Punkt auf der Unterlage.
 */

// -----------------------------------------------------------------------------
// Die Szene: wo Gegenstände stehen und wie hoch die Unterlage ist
// -----------------------------------------------------------------------------

export interface Gegenstandslage {
  art: Gegenstand;
  /**
   * Stuhl: x der Lehne; Tisch und Stufe: Vorderkante; Hocker, Wand und
   * Türrahmen: Mitte.
   */
  x: number;
  /** Stuhl, Tisch, Stufe: nach welcher Seite der Gegenstand von x aus reicht. */
  zu: 1 | -1;
  stufen: number;
  /** Der Stuhl, auf dem die Person sitzt (Lehne hinter ihr). */
  sitzt: boolean;
}

export interface Umgebung {
  ansicht: Ansicht;
  unterlage: Unterlage;
  gegenstaende: Gegenstandslage[];
}

/** Standardlagen der Gegenstände, relativ zum Anker der Figur. */
const STANDARD_X: Readonly<Record<Gegenstand, number>> = {
  stuhl: 34,
  tisch: 30,
  wand: 45,
  tuerrahmen: 70,
  stufe: 18,
  hocker: 78,
};

export const STUFE_TIEFE = 28;
export const STUHL_TIEFE = 42;

export function grundhoehe(u: Pick<Umgebung, 'unterlage'>): number {
  if (u.unterlage === 'bett') return HOEHE.bett;
  if (u.unterlage === 'matte') return HOEHE.matte;
  return 0;
}

/** Höhe der Fläche unter x: Stufe, sonst Unterlage. */
export function flaecheBei(u: Umgebung, x: number): number {
  let h = grundhoehe(u);
  for (const g of u.gegenstaende) {
    if (g.art !== 'stufe') continue;
    for (let n = 0; n < g.stufen; n += 1) {
      const a = g.x + g.zu * n * STUFE_TIEFE;
      const b = g.x + g.zu * g.stufen * STUFE_TIEFE;
      if (x >= Math.min(a, b) - 2 && x <= Math.max(a, b) + 2) {
        h = Math.max(h, HOEHE.stufe * (n + 1));
      }
    }
  }
  return h;
}

export function sitzhoehe(sitz: Sitz): number {
  if (sitz === 'bett') return HOEHE.bett;
  if (sitz === 'hocker') return HOEHE.hocker;
  return HOEHE.stuhlSitz;
}

export function istGegenstand(art: BildHilfsmittel['art']): art is Gegenstand {
  return (
    art === 'stuhl' ||
    art === 'tisch' ||
    art === 'wand' ||
    art === 'tuerrahmen' ||
    art === 'stufe' ||
    art === 'hocker'
  );
}

// -----------------------------------------------------------------------------
// Eine Stellung auflösen
// -----------------------------------------------------------------------------

export function zusammenfuehren(basis: VolleStellung, abweichung: Stellung): VolleStellung {
  const s: VolleStellung = { ...basis };
  // Wer Arme mit Winkeln beschreibt, meint keinen Griff der Grundstellung.
  const armWinkel =
    abweichung.schulter !== undefined ||
    abweichung.ellbogen !== undefined ||
    abweichung.arm !== undefined;
  if (armWinkel && abweichung.haende === undefined) s.haende = [null, null];
  for (const [schluessel, wert] of Object.entries(abweichung)) {
    if (wert !== undefined) (s as unknown as Record<string, unknown>)[schluessel] = wert;
  }
  return s;
}

function seitenname(i: 0 | 1): 'nah' | 'fern' {
  return i === 0 ? 'nah' : 'fern';
}

function setze(s: VolleStellung, name: string, wert: number): VolleStellung {
  const [gelenk, seite] = name.split('_') as [keyof VolleStellung, string | undefined];
  if (seite === undefined) return { ...s, [gelenk]: wert };
  const alt = s[gelenk] as Paar;
  const neu: Paar = seite === 'nah' ? [wert, alt[1]] : [alt[0], wert];
  return { ...s, [gelenk]: neu };
}

function lies(s: VolleStellung, name: string): number {
  const [gelenk, seite] = name.split('_') as [keyof VolleStellung, string | undefined];
  if (seite === undefined) return s[gelenk] as number;
  return (s[gelenk] as Paar)[seite === 'nah' ? 0 : 1];
}

/** Die Hand an einen Punkt: Schulter und Ellbogen neu, der Ellbogen beugt nur in eine Richtung. */
function armZu(
  s: VolleStellung,
  schulter: P,
  ziel: P,
  i: 0 | 1,
  ansicht: Ansicht,
  mitteX: number,
): VolleStellung {
  if (ansicht === 'seite') {
    const [w1, w2] = zweiGelenk(schulter, ziel, MASSE.oberarm, MASSE.unterarm, (a, b) =>
      beugungsguete(b - a),
    );
    return setze(
      setze(s, `schulter_${seitenname(i)}`, normal(w1 + s.rumpf)),
      `ellbogen_${seitenname(i)}`,
      normal(w2 - w1),
    );
  }
  const v = VORZEICHEN[i];
  const tr = 180 - s.rumpf;
  const [w1, w2] = zweiGelenk(schulter, ziel, MASSE.oberarm, MASSE.unterarm, (a) => {
    // Der Ellbogen zeigt vom Körper weg.
    const ell = plus(schulter, MASSE.oberarm, a);
    return v * (ell[0] - mitteX);
  });
  return setze(
    setze(s, `arm_${seitenname(i)}`, normal(v * (w1 - (tr - 180)))),
    `ellbogen_${seitenname(i)}`,
    normal(v * (w2 - w1)),
  );
}

/** Wo eine Hand am eigenen Körper liegt - vor dem Ausrichten. */
function koerperziel(f: Figur, ziel: string, i: 0 | 1): P | null {
  const s = f.stellung;
  const tr = 180 - s.rumpf;
  const seite = f.seiten[i];
  if (f.ansicht === 'front') {
    const v = VORZEICHEN[i];
    if (ziel === 'huefte') return plus(seite.huefte, v * 8, tr - 90);
    if (ziel === 'oberschenkel' || ziel === 'knie') return plus(seite.knie, 5, tr);
    if (ziel === 'brust') return plus(f.schulter, -12, tr);
    if (ziel === 'bauch') return plus(f.becken, 18, tr);
    if (ziel === 'nacken') return plus(f.hals, v * 5, tr - 90);
    return null;
  }
  const vorn = tr - 90;
  const ob = winkelZu(seite.huefte, seite.knie);
  const us = winkelZu(seite.knie, seite.knoechel);
  const anteil = (a: P, b: P, t: number): P => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  if (ziel === 'huefte') return plus(f.becken, 6, vorn);
  if (ziel === 'oberschenkel') return plus(anteil(seite.huefte, seite.knie, 0.62), 6.5, ob + 90);
  if (ziel === 'knie') return plus(seite.knie, 7, ob + 90);
  if (ziel === 'schienbein') return plus(anteil(seite.knie, seite.knoechel, 0.4), 6, us + 90);
  if (ziel === 'fuss') return plus(seite.knoechel, 6, us + 90);
  if (ziel === 'brust') return plus(plus(f.schulter, 13, tr + 180), 9, vorn);
  if (ziel === 'bauch') return plus(plus(f.becken, 17, tr), 10, vorn);
  if (ziel === 'nacken') return plus(f.hals, 6, tr + 90);
  return null;
}

function naechsterGegenstand(u: Umgebung, art: Gegenstand, x: number): Gegenstandslage | undefined {
  return u.gegenstaende
    .filter((g) => g.art === art)
    .sort((a, b) => Math.abs(a.x - x) - Math.abs(b.x - x))[0];
}

/** Wo eine Hand an einem Gegenstand liegt - nach dem Ausrichten. */
function weltziel(f: Figur, u: Umgebung, ziel: string, i: 0 | 1): P | null {
  const r = STRICH.unterarm / 2;
  const front = f.ansicht === 'front';
  const v = VORZEICHEN[i];
  if (ziel === 'lehne') {
    const g = naechsterGegenstand(u, 'stuhl', f.becken[0]);
    return g ? [g.x, HOEHE.stuhlLehne + r] : null;
  }
  if (ziel === 'sitz') {
    const g = naechsterGegenstand(u, 'stuhl', f.becken[0]);
    if (!g) return null;
    if (g.sitzt) {
      // Neben dem Becken auf den Sitz gestützt.
      return front
        ? [f.becken[0] + v * 21, HOEHE.stuhlSitz + r]
        : [f.becken[0] + 3, HOEHE.stuhlSitz + r];
    }
    return [g.x + g.zu * 6, HOEHE.stuhlSitz + r];
  }
  if (ziel === 'tisch') {
    const g = naechsterGegenstand(u, 'tisch', f.becken[0]);
    return g ? [g.x + g.zu * 5, HOEHE.tisch + r] : null;
  }
  if (ziel === 'wand') {
    const g = naechsterGegenstand(u, 'wand', f.schulter[0]);
    if (!g) return null;
    const seite = g.x >= f.schulter[0] ? -1 : 1;
    return [g.x + seite * (2 + r), f.schulter[1] - 4];
  }
  if (ziel === 'boden') {
    const boden = flaecheBei(u, f.schulter[0]) + r;
    if (front) return [f.seiten[i].schulterpunkt[0] + v * 10, boden];
    const hoch = f.schulter[1] - boden > (MASSE.oberarm + MASSE.unterarm) * 0.55;
    if (hoch) return [f.schulter[0] + 2, boden];
    // Liegend: neben dem Körper, zum Becken hin.
    const zumBecken = Math.sign(f.becken[0] - f.schulter[0]) || 1;
    return [f.schulter[0] + zumBecken * (MASSE.oberarm + MASSE.unterarm) * 0.9, boden];
  }
  return null;
}

/** Hände an Ziele: am Körper vor dem Ausrichten, an Gegenständen danach. */
function greife(f: Figur, u: Umgebung | null): Figur {
  let s = f.stellung;
  for (const i of SEITEN) {
    const ziel = s.haende[i];
    if (!ziel) continue;
    const p = u === null ? koerperziel(f, ziel, i) : weltziel(f, u, ziel, i);
    if (!p) continue;
    s = armZu(s, f.seiten[i].schulterpunkt, p, i, f.ansicht, f.becken[0]);
  }
  if (s === f.stellung) return f;
  return verschiebe(vorwaerts(s, f.ansicht), f.becken[0], f.becken[1]);
}

/** Ein Fuß an einen Gegenstand: Hüfte und Knie neu, das Knie beugt nur nach vorn. */
function fussgriffe(f: Figur, u: Umgebung): Figur {
  if (f.ansicht !== 'seite') return f;
  let s = f.stellung;
  for (const i of SEITEN) {
    const ziel = s.fuesse[i];
    if (!ziel) continue;
    const seite = f.seiten[i];
    let p: P | null = null;
    if (ziel === 'stufe') {
      const g = naechsterGegenstand(u, 'stufe', seite.knoechel[0]);
      if (g) {
        p = [g.x + g.zu * STUFE_TIEFE * 0.45, HOEHE.stufe + MASSE.knoechel + STRICH.fuss / 2];
      }
    } else if (ziel === 'hocker') {
      const g = naechsterGegenstand(u, 'hocker', seite.knoechel[0]);
      // Die Ferse liegt auf: der Knöchel etwas über der Sitzfläche.
      if (g) p = [g.x - 4, HOEHE.hocker + MASSE.knoechel + 1];
    } else if (ziel === 'wand') {
      const g = naechsterGegenstand(u, 'wand', seite.knoechel[0]);
      if (g) {
        const zurWand = Math.sign(g.x - f.becken[0]) || 1;
        p = [g.x - zurWand * (MASSE.knoechel + 3), seite.knoechel[1]];
      }
    }
    if (!p) continue;
    const [w1, w2] = zweiGelenk(seite.huefte, p, MASSE.oberschenkel, MASSE.unterschenkel, (a, b) =>
      beugungsguete(a - b),
    );
    s = setze(
      setze(s, `huefte_${seitenname(i)}`, normal(w1 + s.rumpf)),
      `knie_${seitenname(i)}`,
      normal(w1 - w2),
    );
  }
  if (s === f.stellung) return f;
  return verschiebe(vorwaerts(s, 'seite'), f.becken[0], f.becken[1]);
}

/** Bisektion: ein Winkel, bei dem beide Punkte gleich hoch aufliegen. */
function loese(s: VolleStellung, ansicht: Ansicht): VolleStellung {
  if (!s.loesen) return s;
  const { winkel, gleich } = s.loesen;
  const fehler = (w: number) => {
    const f = greife(vorwaerts(setze(s, winkel, w), ansicht), null);
    return unterkante(f, gleich[0]) - unterkante(f, gleich[1]);
  };
  const mitte = lies(s, winkel);
  if (Math.abs(fehler(mitte)) < 0.05) return s;
  // Den nächsten Vorzeichenwechsel um den Ausgangswert suchen.
  let bereich: [number, number] | null = null;
  for (let schritt = 0; schritt < 120 && !bereich; schritt += 1.5) {
    for (const seite of [1, -1]) {
      const a = mitte + seite * schritt;
      const b = mitte + seite * (schritt + 1.5);
      if (Math.sign(fehler(a)) !== Math.sign(fehler(b))) {
        bereich = [a, b];
        break;
      }
    }
  }
  if (!bereich) return s;
  let [lo, hi] = bereich;
  let flo = fehler(lo);
  for (let n = 0; n < 40; n += 1) {
    const m = (lo + hi) / 2;
    const fm = fehler(m);
    if (Math.sign(fm) === Math.sign(flo)) {
      lo = m;
      flo = fm;
    } else {
      hi = m;
    }
  }
  return setze(s, winkel, (lo + hi) / 2);
}

/** Ausrichten: waagerecht am Anker, senkrecht an Sitz, Stütze oder tiefstem Punkt. */
function richteAus(f: Figur, u: Umgebung, anker: Koerperpunkt): Figur {
  const dx = -punkt(f, anker)[0];
  let dy: number;
  const s = f.stellung;
  if (s.sitz) {
    const gesaess = f.ansicht === 'front' ? 6 : STRICH.rumpf / 2;
    // Auf dem Sitz - aber nie mit den Füßen im Boden.
    dy = Math.max(sitzhoehe(s.sitz) - (f.becken[1] - gesaess), grundhoehe(u) - tiefster(f));
  } else if (s.stuetze) {
    const p = punkt(f, s.stuetze);
    dy = flaecheBei(u, p[0] + dx) - (p[1] - radius(f, s.stuetze));
  } else {
    dy = grundhoehe(u) - tiefster(f);
  }
  return verschiebe(f, dx, dy);
}

/**
 * Eine vollständige Stellung in die Szene stellen: lösen, rechnen, am Körper
 * greifen, ausrichten, an Gegenständen greifen.
 */
export function stelle(
  stellung: VolleStellung,
  u: Umgebung,
  anker: Koerperpunkt,
  versatzY = 0,
): Figur {
  const geloest = loese(stellung, u.ansicht);
  let f = greife(vorwaerts(geloest, u.ansicht), null);
  f = richteAus(f, u, anker);
  if (versatzY !== 0) f = verschiebe(f, 0, versatzY);
  f = fussgriffe(f, u);
  return greife(f, u);
}

export function volleStellung(bild: Uebungsbild, welche: 'start' | 'ende'): VolleStellung {
  return zusammenfuehren(GRUND[bild.basis].stellung, bild[welche]);
}

export function ankerVon(bild: Uebungsbild): Koerperpunkt {
  return bild.anker ?? GRUND[bild.basis].anker;
}

/**
 * Die Gegenstände der Szene. Sitzt die Person in Start oder Ende auf einem
 * Stuhl oder Hocker, steht er dort, wo ihr Becken in dieser Stellung ist - und
 * bleibt dort für die andere Stellung.
 */
export function umgebung(bild: Uebungsbild): Umgebung {
  const ansicht = GRUND[bild.basis].ansicht;
  const u: Umgebung = { ansicht, unterlage: bild.unterlage ?? 'boden', gegenstaende: [] };
  for (const h of bild.hilfsmittel ?? []) {
    if (!istGegenstand(h.art)) continue;
    const x = ('x' in h ? h.x : undefined) ?? STANDARD_X[h.art];
    const stufeNach = h.art === 'stufe' ? (h.nach ?? 'vorn') : null;
    u.gegenstaende.push({
      art: h.art,
      x,
      // Stuhl und Tisch reichen von der Person weg; eine Stufe dorthin, wohin sie soll.
      zu: stufeNach ? (stufeNach === 'vorn' ? 1 : -1) : x >= 0 ? 1 : -1,
      stufen: h.art === 'stufe' && 'stufen' in h ? (h.stufen ?? 1) : 1,
      sitzt: false,
    });
  }
  const anker = ankerVon(bild);
  for (const welche of ['start', 'ende'] as const) {
    const s = volleStellung(bild, welche);
    if (s.sitz !== 'stuhl' && s.sitz !== 'hocker') continue;
    const f = richteAus(greife(vorwaerts(loese(s, ansicht), ansicht), null), u, anker);
    const x =
      ansicht === 'front' ? f.becken[0] : s.sitz === 'stuhl' ? f.becken[0] - 13 : f.becken[0] + 4;
    u.gegenstaende.unshift({ art: s.sitz, x, zu: 1, stufen: 1, sitzt: true });
    break;
  }
  return u;
}

/** Start und Ende einer Übung, fertig gestellt. */
export function figuren(bild: Uebungsbild): { start: Figur; ende: Figur; umgebung: Umgebung } {
  const u = umgebung(bild);
  const anker = ankerVon(bild);
  return {
    start: stelle(volleStellung(bild, 'start'), u, anker),
    ende: stelle(volleStellung(bild, 'ende'), u, anker),
    umgebung: u,
  };
}

/** Der Fußwinkel, der einer flach aufliegenden Sohle entspricht. */
function ohneFlach(s: VolleStellung): VolleStellung {
  const sprung: Paar = [s.sprung[0], s.sprung[1]];
  for (const i of SEITEN) {
    if (s.fuss_flach[i]) sprung[i] = -s.rumpf + s.huefte[i] - s.knie[i];
  }
  return { ...s, sprung, fuss_flach: [false, false] };
}

/**
 * Zwischenstellung für die Animation: Winkel linear gemischt. Griffe, die in
 * Start und Ende gleich sind, bleiben Griffe (die Hand bleibt an der Lehne);
 * die übrigen werden zu den Winkeln der gelösten Stellung.
 */
export function zwischen(bild: Uebungsbild, u: Umgebung, t: number): Figur {
  const anker = ankerVon(bild);
  const roh = [volleStellung(bild, 'start'), volleStellung(bild, 'ende')] as const;
  const flachGleich =
    roh[0].fuss_flach[0] === roh[1].fuss_flach[0] && roh[0].fuss_flach[1] === roh[1].fuss_flach[1];
  const [a, e] = roh.map((s) => {
    const fertig = stelle(s, u, anker).stellung;
    return flachGleich ? fertig : ohneFlach(fertig);
  }) as [VolleStellung, VolleStellung];
  const mix = (x: number, y: number) => x + (y - x) * t;
  const paar = (x: Paar, y: Paar): Paar => [mix(x[0], y[0]), mix(x[1], y[1])];
  const gleich = <T>(x: [T, T], y: [T, T]): [T | null, T | null] => [
    x[0] === y[0] ? x[0] : null,
    x[1] === y[1] ? x[1] : null,
  ];
  const m: VolleStellung = {
    rumpf: mix(a.rumpf, e.rumpf),
    wirbelsaeule: mix(a.wirbelsaeule, e.wirbelsaeule),
    kopf: mix(a.kopf, e.kopf),
    huefte: paar(a.huefte, e.huefte),
    knie: paar(a.knie, e.knie),
    sprung: paar(a.sprung, e.sprung),
    schulter: paar(a.schulter, e.schulter),
    ellbogen: paar(a.ellbogen, e.ellbogen),
    bein: paar(a.bein, e.bein),
    arm: paar(a.arm, e.arm),
    fuss_flach: a.fuss_flach,
    haende: gleich(a.haende, e.haende),
    fuesse: gleich(a.fuesse, e.fuesse),
    loesen: null,
    sitz: a.sitz,
    stuetze: a.stuetze,
  };
  if (a.sitz === e.sitz && a.stuetze === e.stuetze) return stelle(m, u, anker);
  // Wechselt die Auflage (vom Stuhl in den Stand, auf die Stufe), gleitet die
  // Höhe von der einen zur anderen.
  const hoehe = (s: VolleStellung) =>
    richteAus(greife(vorwaerts(s, u.ansicht), null), u, anker).becken[1];
  const versatz = (hoehe({ ...m, sitz: e.sitz, stuetze: e.stuetze }) - hoehe(m)) * t;
  return stelle(m, u, anker, versatz);
}

/** Lage eines Hilfsmittels, das an der Figur hängt. */
export function koerperOrt(f: Figur, an: string): P {
  if (an === 'haende') {
    const [a, b] = [f.seiten[0].hand, f.seiten[1].hand];
    return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  }
  if (an === 'knie') {
    const [a, b] = [f.seiten[0].knie, f.seiten[1].knie];
    return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  }
  return punkt(f, an as Koerperpunkt);
}
