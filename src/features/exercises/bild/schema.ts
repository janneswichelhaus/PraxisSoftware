import { z } from 'zod';

/**
 * Das Übungsbild, Fassung 1 (ANN-381): eine Posen-Beschreibung, aus der der
 * Code eine Linienfigur zeichnet - keine Datei, kein Anbieter, keine Ablage
 * (ADR-017 Punkt 4).
 *
 * Gespeichert wird genau dieses Objekt: an der Variante (`illustration`) und
 * beim Zuweisen eingefroren an der Planposition (ANN-300). Was hier als Wert
 * erlaubt ist, gehört deshalb zur Fassung: Grundstellungen, Maße und
 * Bedeutung der Winkel ändern sich nie still. Eine Änderung, die alte Bilder
 * anders zeichnen würde, ist eine neue Fassung (`v: 2`), und Fassung 1 bleibt
 * zeichenbar (`bild.test.ts` hält die Pfade fest).
 *
 * Gezeichnet wird nur aus Zahlen und festen Werten dieser Datei - keine
 * Zeichenkette aus den Daten landet im SVG.
 *
 * Winkel in Grad. Seitenansicht: Die Person blickt nach rechts. „nah" ist die
 * Körperseite zum Betrachter, „fern" die abgewandte. Frontansicht: „nah" ist
 * die Seite links im Bild, „fern" die rechts im Bild.
 */

export const ANSICHTEN = ['seite', 'front'] as const;
export type Ansicht = (typeof ANSICHTEN)[number];

/** Grundstellungen: jede Übung erbt eine und ändert nur, was sie braucht. */
export const GRUNDSTELLUNGEN = [
  'stand',
  'sitz',
  'langsitz',
  'rueckenlage',
  'rueckenlage_angestellt',
  'bauchlage',
  'vierfuessler',
  'kniestand',
  'stand_front',
  'sitz_front',
  'seitlage_front',
] as const;
export type Grundstellung = (typeof GRUNDSTELLUNGEN)[number];

/** Punkte am Körper - für Anker, Pfeil, Kontakt und Hilfsmittel. */
export const KOERPERPUNKTE = [
  'becken',
  'schulter',
  'kopf',
  'knie_nah',
  'knie_fern',
  'knoechel_nah',
  'knoechel_fern',
  'ferse_nah',
  'ferse_fern',
  'zehen_nah',
  'zehen_fern',
  'ellbogen_nah',
  'ellbogen_fern',
  'hand_nah',
  'hand_fern',
] as const;
export type Koerperpunkt = (typeof KOERPERPUNKTE)[number];

/**
 * Wohin eine Hand greift. Am eigenen Körper (`huefte` …) oder an einem
 * Hilfsmittel der Szene (`lehne` …). Der Zeichner setzt Schulter und
 * Ellbogen dann selbst (Zwei-Gelenk-Rechnung).
 */
export const HANDZIELE = [
  'huefte',
  'oberschenkel',
  'knie',
  'schienbein',
  'fuss',
  'brust',
  'bauch',
  'nacken',
  'lehne',
  'sitz',
  'tisch',
  'wand',
  'boden',
] as const;
export type Handziel = (typeof HANDZIELE)[number];

/** Wohin ein Fuß gesetzt wird - Hüfte und Knie rechnet der Zeichner. */
export const FUSSZIELE = ['stufe', 'hocker', 'wand'] as const;
export type Fussziel = (typeof FUSSZIELE)[number];

/** Gelenke, deren Winkel der Löser so wählt, dass zwei Punkte gleich hoch aufliegen. */
export const LOESBARE_WINKEL = [
  'rumpf',
  'huefte_nah',
  'huefte_fern',
  'knie_nah',
  'knie_fern',
  'schulter_nah',
  'schulter_fern',
  'sprung_nah',
  'sprung_fern',
] as const;
export type LoesbarerWinkel = (typeof LOESBARE_WINKEL)[number];

/** Worauf das Becken sitzt. */
export const SITZE = ['stuhl', 'bett', 'hocker'] as const;
export type Sitz = (typeof SITZE)[number];

/** Worauf die Person liegt oder steht. */
export const UNTERLAGEN = ['boden', 'matte', 'bett'] as const;
export type Unterlage = (typeof UNTERLAGEN)[number];

/** Feste Gegenstände der Szene. */
export const GEGENSTAENDE = ['stuhl', 'tisch', 'wand', 'tuerrahmen', 'stufe', 'hocker'] as const;
export type Gegenstand = (typeof GEGENSTAENDE)[number];

const winkel = z.number().finite().min(-360).max(360);
const paar = z.tuple([winkel, winkel]);
const lage = z.number().finite().min(-200).max(200);

const handziel = z.enum(HANDZIELE).nullable();
const fussziel = z.enum(FUSSZIELE).nullable();

/**
 * Eine Stellung - nur Abweichungen von der Grundstellung. Seitenansicht:
 *
 * - `rumpf`: Neigung aus der Senkrechten; + nach vorn, 90 waagerecht mit dem
 *   Kopf vorn (Bauchlage, Vierfüßler), -90 waagerecht mit dem Kopf hinten
 *   (Rückenlage).
 * - `wirbelsaeule`: Krümmung; + rund (Beugung), - hohl (Streckung).
 * - `kopf`: Neigung gegen den Rumpf; + Kinn zur Brust.
 * - `huefte`, `knie`, `ellbogen`: Beugung. `schulter`: Anteversion (0 hängt,
 *   90 nach vorn, 180 über Kopf, negativ nach hinten). `sprung`: + Fußspitze
 *   nach unten, - Fußspitze nach oben.
 *
 * Frontansicht: `rumpf` neigt zur Seite (+ nach rechts im Bild, 90 liegt mit
 * dem Kopf rechts), `bein` und `arm` spreizen ab (0 hängt, 90 waagerecht,
 * 180 über Kopf), `huefte` und `knie` beugen zum Betrachter hin (das Bein
 * erscheint kürzer), `ellbogen` beugt in der Bildebene (+ zum Kopf hin).
 */
export const stellungSchema = z
  .object({
    rumpf: winkel,
    wirbelsaeule: winkel,
    kopf: winkel,
    huefte: paar,
    knie: paar,
    sprung: paar,
    schulter: paar,
    ellbogen: paar,
    bein: paar,
    arm: paar,
    /** Die Sohle liegt flach auf, gleich wie Unterschenkel und Sprunggelenk stehen. */
    fuss_flach: z.tuple([z.boolean(), z.boolean()]),
    haende: z.tuple([handziel, handziel]),
    fuesse: z.tuple([fussziel, fussziel]),
    /**
     * Ein Winkel, den der Löser so wählt, dass beide Punkte gleich hoch
     * aufliegen - etwa Schulter und Fuß bei der Brücke.
     */
    loesen: z
      .object({
        winkel: z.enum(LOESBARE_WINKEL),
        gleich: z.tuple([z.enum(KOERPERPUNKTE), z.enum(KOERPERPUNKTE)]),
      })
      .strict(),
    /** Worauf das Becken sitzt; `null` steht, auch wenn die Grundstellung sitzt. */
    sitz: z.enum(SITZE).nullable(),
    /** Der Punkt, der statt des tiefsten auf der Fläche darunter aufliegt (Stufe). */
    stuetze: z.enum(KOERPERPUNKTE),
  })
  .partial()
  .strict();
export type Stellung = z.infer<typeof stellungSchema>;

const ort = z.enum(KOERPERPUNKTE);

/** Ein Hilfsmittel im Bild. `x` liegt relativ zum Anker der Figur (Einheiten ≈ cm). */
export const bildHilfsmittelSchema = z.discriminatedUnion('art', [
  z.object({ art: z.literal('stuhl'), x: lage.optional() }).strict(),
  z.object({ art: z.literal('tisch'), x: lage.optional() }).strict(),
  z.object({ art: z.literal('wand'), x: lage.optional() }).strict(),
  z.object({ art: z.literal('tuerrahmen'), x: lage.optional() }).strict(),
  z
    .object({
      art: z.literal('stufe'),
      /** Die Kante, an der die Person steht oder über die sie tritt. */
      x: lage.optional(),
      stufen: z.int().min(1).max(3).optional(),
      /** Wohin die Stufe von der Kante aus reicht; ohne Angabe nach vorn. */
      nach: z.enum(['vorn', 'hinten']).optional(),
    })
    .strict(),
  z.object({ art: z.literal('hocker'), x: lage.optional() }).strict(),
  z.object({ art: z.literal('kissen'), an: ort }).strict(),
  z.object({ art: z.literal('rolle'), an: ort }).strict(),
  z
    .object({ art: z.literal('ball'), an: z.union([ort, z.literal('haende'), z.literal('knie')]) })
    .strict(),
  z.object({ art: z.literal('hantel'), an: z.enum(['hand_nah', 'hand_fern']) }).strict(),
  z
    .object({ art: z.literal('manschette'), an: z.enum(['knoechel_nah', 'knoechel_fern']) })
    .strict(),
  z.object({ art: z.literal('stab'), an: z.literal('haende') }).strict(),
  z
    .object({
      art: z.literal('band'),
      von: z.union([ort, z.enum(GEGENSTAENDE)]),
      nach: ort,
    })
    .strict(),
  z
    .object({
      art: z.literal('handtuch'),
      von: ort,
      nach: ort,
    })
    .strict(),
  z.object({ art: z.literal('gehstock'), an: z.enum(['hand_nah', 'hand_fern']) }).strict(),
]);
export type BildHilfsmittel = z.infer<typeof bildHilfsmittelSchema>;

export const uebungsbildSchema = z
  .object({
    v: z.literal(1),
    basis: z.enum(GRUNDSTELLUNGEN),
    start: stellungSchema,
    ende: stellungSchema,
    /** Worauf die Person liegt oder steht; ohne Angabe der Boden. */
    unterlage: z.enum(UNTERLAGEN).optional(),
    /** Der Punkt, der zwischen Start und Ende an seiner Stelle bleibt. */
    anker: ort.optional(),
    hilfsmittel: z.array(bildHilfsmittelSchema).max(6).optional(),
    /** Wo der Pfeil die Bewegung zeigt - höchstens zwei Punkte. */
    bewegung: z.array(ort).max(2).optional(),
  })
  .strict();
export type Uebungsbild = z.infer<typeof uebungsbildSchema>;

/** Größte gespeicherte Länge eines Bildes in Bytes (UTF-8), wie am Server. */
export const BILD_HOECHSTENS_BYTES = 4096;

/**
 * Die Textform, in der PostgreSQL ein `jsonb` ausgibt: ein Leerzeichen nach
 * jedem Doppelpunkt und Komma. Nach ihr misst der Server die Größe
 * (`octet_length(illustration::text)`), deshalb misst der Client genauso.
 */
function jsonbText(wert: unknown): string {
  if (Array.isArray(wert)) return `[${wert.map(jsonbText).join(', ')}]`;
  if (wert !== null && typeof wert === 'object') {
    const teile = Object.entries(wert as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${JSON.stringify(k)}: ${jsonbText(v)}`);
    return `{${teile.join(', ')}}`;
  }
  return JSON.stringify(wert) ?? 'null';
}

export function bildBytes(bild: unknown): number {
  return new TextEncoder().encode(jsonbText(bild)).length;
}

/**
 * Liest ein gespeichertes Bild. Was nicht passt - eine spätere Fassung, ein
 * Fehler -, wird zu `null`: Lieber kein Bild als ein falsches.
 */
export function bildOderNichts(roh: unknown): Uebungsbild | null {
  if (roh === null || roh === undefined) return null;
  const ergebnis = uebungsbildSchema.safeParse(roh);
  return ergebnis.success ? ergebnis.data : null;
}

/** Für Antworten des Servers: ein ungültiges Bild bricht die Antwort nicht. */
export const bildFeld = z.unknown().transform((roh) => bildOderNichts(roh));
