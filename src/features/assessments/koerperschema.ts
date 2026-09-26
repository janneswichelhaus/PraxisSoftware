/**
 * Das Körperschema (FRB-002d, `IDEA-PRX-027`, **ANN-107**).
 *
 * Grundlage ist die Zeichnung von Jannes (Vorder- und Rückansicht in einem
 * Bild, `koerperschema.webp`, 820 × 749). Markiert wird mit einem **Kreis an
 * der angetippten Stelle**; gespeichert werden die Stelle und der Bereich, in
 * dem sie liegt. Die Stelle ist genauer als jede Einteilung, der Bereich
 * macht sie lesbar — in der Akte, im Verlauf und in der Kopie nach Art. 15
 * steht „Knie links", nicht ein Koordinatenpaar.
 *
 * Der Bereich ergibt sich aus dem **nächstgelegenen Ankerpunkt**. Das ist
 * gröber als ein Umriss je Bereich, aber es bleibt nachvollziehbar und braucht
 * keine zweite Zeichnung, die zur ersten passen muss. Ein Tipp weiter als
 * `MAX_ABSTAND` von jedem Anker liegt neben der Figur und setzt nichts.
 *
 * Seiten sind immer die **der Person**: In der Vorderansicht liegt ihre rechte
 * Seite links im Bild, in der Rückansicht rechts. Es wird nur dokumentiert,
 * nicht bewertet (ADR-006 Punkt 2 und 11).
 *
 * Die Kennungen sind unveränderlich wie die der Definitionen (Arbeitsauftrag §1).
 */

export type Ansicht = 'vorne' | 'hinten';

export const BILD_BREITE = 820;
export const BILD_HOEHE = 749;
/** Links davon die Vorderansicht, rechts die Rückansicht. */
export const ANSICHTEN_GRENZE = 410;
/** Größter Abstand eines Tipps zum nächsten Anker, in Bildpunkten. */
export const MAX_ABSTAND = 60;

export interface Punkt {
  x: number;
  y: number;
}

export interface Koerperbereich {
  id: string;
  label: string;
  /** Wo der Bereich in der Zeichnung liegt; ein Bereich kann in beiden Ansichten liegen. */
  anker: readonly Punkt[];
}

const MITTE_VORNE = 232;
const MITTE_HINTEN = 595;

/**
 * Ein Paar rechts und links. `imBildLinks` liegt links der Mitte der Ansicht —
 * vorne die rechte Seite der Person, hinten die linke.
 */
function paar(
  stamm: string,
  label: string,
  vorne: readonly Punkt[],
  hinten: readonly Punkt[] = [],
): Koerperbereich[] {
  const gespiegelt = (p: Punkt, mitte: number): Punkt => ({ x: 2 * mitte - p.x, y: p.y });
  return [
    {
      id: `${stamm}_rechts`,
      label: `${label} rechts`,
      anker: [...vorne, ...hinten.map((p) => gespiegelt(p, MITTE_HINTEN))],
    },
    {
      id: `${stamm}_links`,
      label: `${label} links`,
      anker: [...vorne.map((p) => gespiegelt(p, MITTE_VORNE)), ...hinten],
    },
  ];
}

export const KOERPERBEREICHE: readonly Koerperbereich[] = [
  { id: 'kopf', label: 'Kopf, Gesicht', anker: [{ x: 232, y: 50 }] },
  { id: 'hals', label: 'Hals', anker: [{ x: 232, y: 108 }] },
  ...paar('schulter', 'Schulter', [{ x: 152, y: 142 }], [{ x: 522, y: 140 }]),
  { id: 'brustkorb', label: 'Brustkorb', anker: [{ x: 232, y: 175 }] },
  { id: 'bauch', label: 'Bauch', anker: [{ x: 232, y: 270 }] },
  ...paar('oberarm', 'Oberarm', [{ x: 136, y: 212 }], [{ x: 500, y: 214 }]),
  ...paar('ellenbogen', 'Ellenbogen', [{ x: 121, y: 266 }], [{ x: 484, y: 270 }]),
  ...paar('unterarm', 'Unterarm', [{ x: 101, y: 316 }], [{ x: 463, y: 322 }]),
  ...paar('hand', 'Hand', [{ x: 74, y: 382 }], [{ x: 440, y: 385 }]),
  ...paar('leiste', 'Leiste, Hüfte', [{ x: 199, y: 350 }]),
  ...paar('oberschenkel_vorne', 'Oberschenkel vorne', [{ x: 196, y: 430 }]),
  ...paar('knie', 'Knie', [{ x: 196, y: 500 }]),
  ...paar('unterschenkel', 'Unterschenkel', [{ x: 196, y: 590 }]),
  ...paar('fuss', 'Fuß', [{ x: 190, y: 690 }]),
  { id: 'hinterkopf', label: 'Hinterkopf', anker: [{ x: 595, y: 50 }] },
  { id: 'nacken', label: 'Nacken, HWS', anker: [{ x: 595, y: 110 }] },
  ...paar('schulterblatt', 'Schulterblatt', [], [{ x: 551, y: 175 }]),
  { id: 'bws', label: 'Brustwirbelsäule', anker: [{ x: 595, y: 205 }] },
  { id: 'lws', label: 'Lendenwirbelsäule', anker: [{ x: 595, y: 290 }] },
  ...paar('gesaess', 'Gesäß, ISG', [], [{ x: 565, y: 360 }]),
  ...paar('oberschenkel_hinten', 'Oberschenkel hinten', [], [{ x: 565, y: 440 }]),
  ...paar('kniekehle', 'Kniekehle', [], [{ x: 562, y: 505 }]),
  ...paar('wade', 'Wade', [], [{ x: 561, y: 585 }]),
  ...paar('ferse', 'Ferse', [], [{ x: 553, y: 690 }]),
];

const NACH_KENNUNG = new Map(KOERPERBEREICHE.map((bereich) => [bereich.id, bereich]));

export function istKoerperbereich(kennung: string): boolean {
  return NACH_KENNUNG.has(kennung);
}

export function ansichtVon(punkt: Punkt): Ansicht {
  return punkt.x < ANSICHTEN_GRENZE ? 'vorne' : 'hinten';
}

/** Der Bereich zu einer Stelle im Bild — oder `null` neben der Figur. */
export function bereichAn(punkt: Punkt): Koerperbereich | null {
  let bester: Koerperbereich | null = null;
  let abstand = MAX_ABSTAND;
  for (const bereich of KOERPERBEREICHE) {
    for (const anker of bereich.anker) {
      // Nur Anker derselben Ansicht: Ein Tipp neben die Rückansicht ist nie vorn.
      if (ansichtVon(anker) !== ansichtVon(punkt)) continue;
      const d = Math.hypot(anker.x - punkt.x, anker.y - punkt.y);
      if (d < abstand) {
        abstand = d;
        bester = bereich;
      }
    }
  }
  return bester;
}

/** Eine gespeicherte Markierung: Stelle relativ zum Bild (0 bis 1) und ihr Bereich. */
export interface Markierung {
  x: number;
  y: number;
  bereich: string;
}

export function imBild(markierung: Pick<Markierung, 'x' | 'y'>): Punkt {
  return { x: markierung.x * BILD_BREITE, y: markierung.y * BILD_HOEHE };
}

export function alsMarkierung(punkt: Punkt, bereich: Koerperbereich): Markierung {
  const runden = (wert: number) => Math.round(wert * 1000) / 1000;
  return { x: runden(punkt.x / BILD_BREITE), y: runden(punkt.y / BILD_HOEHE), bereich: bereich.id };
}

/** Die Bereiche in Worten, jeder einmal, in der Reihenfolge des Schemas. */
export function bereicheText(kennungen: readonly string[]): string {
  return KOERPERBEREICHE.filter((bereich) => kennungen.includes(bereich.id))
    .map((bereich) => bereich.label)
    .join(', ');
}
