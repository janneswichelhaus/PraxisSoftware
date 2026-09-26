/**
 * Die Bereiche des Körperschemas (FRB-002d, `IDEA-PRX-027`).
 *
 * Ein Körperschema **dokumentiert**, wo die Person ihre Beschwerden
 * einzeichnet — es bewertet nichts (ADR-006 Punkt 2). Deshalb sind die
 * Bereiche grob und benannt statt frei gezeichnet: Eine Kennung wie
 * `schulter_rechts` ist in der Kopie nach Art. 15 lesbar, im Verlauf
 * vergleichbar und braucht keine Bilddatei in der Akte.
 *
 * Seiten sind immer die **der Person**. In der Vorderansicht liegt ihre rechte
 * Seite links im Bild, in der Rückansicht rechts — die Beschriftung „R" und
 * „L" am Bild sagt das, damit niemand spiegelverkehrt einträgt.
 *
 * Die Kennungen sind unveränderlich wie die der Definitionen: Eine Kennung,
 * die einmal gespeichert ist, verschwindet nie (Arbeitsauftrag §1).
 */

export type Ansicht = 'vorne' | 'hinten';

export interface Koerperbereich {
  id: string;
  label: string;
  ansicht: Ansicht;
  /** Rechteck im Bild (x, y, Breite, Höhe) auf einer Fläche von 120 × 240. */
  form: readonly [number, number, number, number];
}

export const BILD_BREITE = 120;
export const BILD_HOEHE = 240;

type Rechteck = readonly [number, number, number, number];

/** Das Gegenstück auf der anderen Bildseite. */
function gespiegelt([x, y, b, h]: Rechteck): Rechteck {
  return [BILD_BREITE - x - b, y, b, h];
}

/**
 * Ein Paar rechts und links. `imBildLinks` ist das Rechteck, das links im Bild
 * liegt — vorne die rechte Seite der Person, hinten die linke.
 */
function paar(
  stamm: string,
  label: string,
  ansicht: Ansicht,
  imBildLinks: Rechteck,
): Koerperbereich[] {
  const rechtsImBildLinks = ansicht === 'vorne';
  const rechts = rechtsImBildLinks ? imBildLinks : gespiegelt(imBildLinks);
  const links = rechtsImBildLinks ? gespiegelt(imBildLinks) : imBildLinks;
  return [
    { id: `${stamm}_rechts`, label: `${label} rechts`, ansicht, form: rechts },
    { id: `${stamm}_links`, label: `${label} links`, ansicht, form: links },
  ];
}

export const KOERPERBEREICHE: readonly Koerperbereich[] = [
  // Vorderansicht
  { id: 'kopf', label: 'Kopf, Gesicht', ansicht: 'vorne', form: [48, 2, 24, 28] },
  { id: 'hals', label: 'Hals', ansicht: 'vorne', form: [53, 30, 14, 10] },
  ...paar('schulter', 'Schulter', 'vorne', [30, 40, 18, 12]),
  { id: 'brustkorb', label: 'Brustkorb', ansicht: 'vorne', form: [48, 40, 24, 28] },
  { id: 'bauch', label: 'Bauch', ansicht: 'vorne', form: [44, 68, 32, 24] },
  ...paar('oberarm', 'Oberarm', 'vorne', [22, 52, 14, 28]),
  ...paar('ellenbogen', 'Ellenbogen', 'vorne', [20, 80, 14, 10]),
  ...paar('unterarm', 'Unterarm', 'vorne', [17, 90, 14, 26]),
  ...paar('hand', 'Hand', 'vorne', [13, 116, 17, 18]),
  ...paar('leiste', 'Leiste, Hüfte', 'vorne', [44, 92, 16, 14]),
  ...paar('oberschenkel_vorne', 'Oberschenkel vorne', 'vorne', [42, 106, 17, 44]),
  ...paar('knie', 'Knie', 'vorne', [43, 150, 15, 14]),
  ...paar('unterschenkel', 'Unterschenkel', 'vorne', [44, 164, 13, 50]),
  ...paar('fuss', 'Fuß', 'vorne', [40, 214, 17, 12]),
  // Rückansicht
  { id: 'hinterkopf', label: 'Hinterkopf', ansicht: 'hinten', form: [48, 2, 24, 28] },
  { id: 'nacken', label: 'Nacken, HWS', ansicht: 'hinten', form: [53, 30, 14, 10] },
  ...paar('schulterblatt', 'Schulterblatt', 'hinten', [32, 40, 22, 24]),
  { id: 'bws', label: 'Brustwirbelsäule', ansicht: 'hinten', form: [54, 40, 12, 32] },
  { id: 'lws', label: 'Lendenwirbelsäule', ansicht: 'hinten', form: [46, 72, 28, 20] },
  ...paar('gesaess', 'Gesäß, ISG', 'hinten', [42, 92, 18, 16]),
  ...paar('oberschenkel_hinten', 'Oberschenkel hinten', 'hinten', [42, 108, 17, 42]),
  ...paar('kniekehle', 'Kniekehle', 'hinten', [43, 150, 15, 14]),
  ...paar('wade', 'Wade', 'hinten', [44, 164, 13, 50]),
  ...paar('ferse', 'Ferse', 'hinten', [42, 214, 15, 12]),
];

/**
 * Die Arme in der Rückansicht: nur Umriss, nicht wählbar. Sie sind in der
 * Vorderansicht schon je Abschnitt wählbar; zweimal dieselbe Stelle unter
 * zwei Kennungen wäre im Verlauf nicht vergleichbar.
 */
const ARME: readonly Rechteck[] = [
  [22, 52, 14, 28],
  [20, 80, 14, 10],
  [17, 90, 14, 26],
  [13, 116, 17, 18],
];

export const RUECKANSICHT_UMRISS: readonly Rechteck[] = ARME.flatMap((form) => [
  form,
  gespiegelt(form),
]);

const NACH_KENNUNG = new Map(KOERPERBEREICHE.map((bereich) => [bereich.id, bereich]));

export function istKoerperbereich(kennung: string): boolean {
  return NACH_KENNUNG.has(kennung);
}

/** Die Bereiche in Worten, in der Reihenfolge des Schemas — nicht der Klicks. */
export function bereicheText(kennungen: readonly string[]): string {
  return KOERPERBEREICHE.filter((bereich) => kennungen.includes(bereich.id))
    .map((bereich) => bereich.label)
    .join(', ');
}
