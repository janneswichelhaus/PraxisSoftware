import type {
  Ansicht,
  Fussziel,
  Grundstellung,
  Handziel,
  Koerperpunkt,
  LoesbarerWinkel,
  Sitz,
} from './schema';

/**
 * Grundstellungen des Übungsbilds, Fassung 1 (ANN-381).
 *
 * Teil der Fassung: Ein gespeichertes Bild nennt nur seine Grundstellung und
 * die Abweichungen davon. Ändert sich hier ein Wert, zeichnet jedes Bild
 * anders, auch ein eingefrorenes - deshalb hält `bild.test.ts` diese Tabelle
 * fest. Eine Korrektur ist eine neue Fassung, keine stille Änderung.
 */

export type Paar = [number, number];

export interface VolleStellung {
  rumpf: number;
  wirbelsaeule: number;
  kopf: number;
  huefte: Paar;
  knie: Paar;
  sprung: Paar;
  schulter: Paar;
  ellbogen: Paar;
  bein: Paar;
  arm: Paar;
  fuss_flach: [boolean, boolean];
  haende: [Handziel | null, Handziel | null];
  fuesse: [Fussziel | null, Fussziel | null];
  loesen: { winkel: LoesbarerWinkel; gleich: [Koerperpunkt, Koerperpunkt] } | null;
  sitz: Sitz | null;
  stuetze: Koerperpunkt | null;
}

export interface Grund {
  ansicht: Ansicht;
  stellung: VolleStellung;
  /** Der Punkt, der zwischen Start und Ende stehen bleibt. */
  anker: Koerperpunkt;
}

const NEUTRAL: VolleStellung = {
  rumpf: 0,
  wirbelsaeule: 0,
  kopf: 0,
  huefte: [0, 0],
  knie: [0, 0],
  sprung: [0, 0],
  schulter: [0, 0],
  ellbogen: [0, 0],
  bein: [0, 0],
  arm: [0, 0],
  fuss_flach: [false, false],
  haende: [null, null],
  fuesse: [null, null],
  loesen: null,
  sitz: null,
  stuetze: null,
};

function grund(ansicht: Ansicht, anker: Koerperpunkt, stellung: Partial<VolleStellung>): Grund {
  return { ansicht, anker, stellung: { ...NEUTRAL, ...stellung } };
}

export const GRUND: Readonly<Record<Grundstellung, Grund>> = {
  stand: grund('seite', 'knoechel_nah', {
    schulter: [4, -4],
    ellbogen: [10, 10],
    fuss_flach: [true, true],
  }),
  sitz: grund('seite', 'becken', {
    rumpf: -3,
    huefte: [87, 87],
    knie: [87, 87],
    schulter: [18, 14],
    ellbogen: [62, 62],
    haende: ['oberschenkel', 'oberschenkel'],
    fuss_flach: [true, true],
    sitz: 'stuhl',
  }),
  langsitz: grund('seite', 'becken', {
    rumpf: -6,
    huefte: [90, 90],
    sprung: [10, 10],
    schulter: [-14, -14],
    ellbogen: [8, 8],
  }),
  rueckenlage: grund('seite', 'becken', {
    rumpf: -90,
    sprung: [12, 12],
    schulter: [4, 4],
  }),
  rueckenlage_angestellt: grund('seite', 'becken', {
    rumpf: -90,
    huefte: [45, 45],
    knie: [90, 90],
    schulter: [4, 4],
    fuss_flach: [true, true],
  }),
  bauchlage: grund('seite', 'becken', {
    rumpf: 90,
    kopf: 8,
    sprung: [70, 70],
    schulter: [-2, -2],
  }),
  vierfuessler: grund('seite', 'knie_nah', {
    rumpf: 90,
    huefte: [90, 90],
    knie: [90, 90],
    sprung: [80, 80],
    schulter: [90, 90],
    loesen: { winkel: 'rumpf', gleich: ['hand_fern', 'knie_fern'] },
  }),
  kniestand: grund('seite', 'knie_nah', {
    knie: [90, 90],
    sprung: [80, 80],
    schulter: [4, -4],
    ellbogen: [10, 10],
  }),
  stand_front: grund('front', 'becken', {
    bein: [3, 3],
    arm: [7, 7],
    ellbogen: [6, 6],
  }),
  sitz_front: grund('front', 'becken', {
    huefte: [90, 90],
    knie: [90, 90],
    bein: [6, 6],
    arm: [10, 10],
    sitz: 'stuhl',
  }),
  seitlage_front: grund('front', 'becken', {
    rumpf: 90,
    arm: [8, 172],
    ellbogen: [0, 30],
  }),
};
