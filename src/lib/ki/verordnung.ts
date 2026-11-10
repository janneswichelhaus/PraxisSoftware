import { z } from 'zod';
import {
  ASSISTENZ_FEHLERTEXTE,
  assistenzAnfragen,
  assistenzVerfuegbar,
  type Kifehler,
} from '@/lib/ki/gateway';

// Felder vom Foto einer Verordnung (ANN-861): Der Anbieter schreibt ab und nennt Stellen, den Wert
// schneidet der Gateway aus der erkannten Zeile. Hinaus gehen nur Kennung und Bytes des offenen
// Scans; der Vorschlag lebt nur im Zustand der Seite (ANN-862).

/** Der Zweck in der Zweckliste des Gateways (`zwecke.ts`). */
export const ZWECK_VERORDNUNG = 'verordnung.felder';

/** Allowlist und Grenze der Ablage (ADR-017 Punkt 18); der Gateway hält dieselben. */
export const SCAN_FORMATE = ['image/jpeg', 'image/png', 'application/pdf'] as const;
export const SCAN_HOECHSTBYTES = 10 * 1024 * 1024;

/** Die Felder eines Vorschlags und wie oft je Feld. */
export const VERORDNUNG_FELDER = {
  ausgestellt_am: 1,
  art: 1,
  verordnende: 1,
  icd10: 1,
  diagnose: 1,
  heilmittel: 4,
  hausbesuch: 1,
} as const;

export type Verordnungsfeld = keyof typeof VERORDNUNG_FELDER;

const FELDNAMEN = Object.keys(VERORDNUNG_FELDER) as [Verordnungsfeld, ...Verordnungsfeld[]];

const antwortSchema = z.object({
  ok: z.literal(true),
  art: z.literal('felder'),
  fundstellen: z
    .array(
      z.object({
        feld: z.enum(FELDNAMEN),
        wert: z.string().min(1).max(200),
        zeile: z.string().min(1).max(200),
      }),
    )
    .max(20),
  quelle: z.enum(['anbieter', 'nachbildung']),
});

/** Ein vorgeschlagener Wert und die erkannte Zeile, aus der er stammt. */
export interface Fundstelle {
  readonly feld: Verordnungsfeld;
  readonly wert: string;
  readonly zeile: string;
}

export type Felderergebnis =
  | {
      readonly ok: true;
      readonly fundstellen: readonly Fundstelle[];
      readonly quelle: 'anbieter' | 'nachbildung';
    }
  | { readonly ok: false; readonly fehler: Kifehler; readonly meldung: string };

function gescheitert(fehler: Kifehler): Felderergebnis {
  return { ok: false, fehler, meldung: ASSISTENZ_FEHLERTEXTE[fehler] };
}

/** Steht jeder Wert in seiner Zeile, und kommt kein Feld öfter vor als erlaubt? */
export function felderGetreu(fundstellen: readonly Fundstelle[]): boolean {
  const zahl = new Map<Verordnungsfeld, number>();
  return fundstellen.every(({ feld, wert, zeile }) => {
    zahl.set(feld, (zahl.get(feld) ?? 0) + 1);
    return (
      wert.trim() === wert && zeile.includes(wert) && zahl.get(feld)! <= VERORDNUNG_FELDER[feld]
    );
  });
}

/** Kann dieses Foto überhaupt gehen? Format und Grenze wie in der Ablage. */
export function scanTauglich(bild: Blob): boolean {
  const format = (bild.type.split(';')[0] ?? '').trim().toLowerCase();
  return (
    (SCAN_FORMATE as readonly string[]).includes(format) &&
    bild.size > 0 &&
    bild.size <= SCAN_HOECHSTBYTES
  );
}

export function felderVerfuegbar(signal?: AbortSignal): Promise<boolean> {
  return assistenzVerfuegbar(ZWECK_VERORDNUNG, signal);
}

/**
 * Hinaus gehen die Kennung des Scans (Berechtigung und Prüfsumme, bleibt im Gateway) und seine
 * Bytes, wie die Seite sie geladen hat - keine Akte; was auf dem Foto steht, geht mit.
 * Wirft nicht.
 */
export async function felderVorschlagen({
  dateiId,
  bild,
  signal,
}: {
  dateiId: string;
  bild: Blob;
  signal?: AbortSignal | undefined;
}): Promise<Felderergebnis> {
  if (bild.size > SCAN_HOECHSTBYTES) return gescheitert('too_large');
  if (!scanTauglich(bild)) return gescheitert('invalid_request');

  const formular = new FormData();
  formular.append('datei', dateiId);
  formular.append('bild', bild, 'scan');
  const antwort = await assistenzAnfragen(ZWECK_VERORDNUNG, formular, signal);
  if (!antwort.ok) return gescheitert(antwort.fehler);
  const erfolg = antwortSchema.safeParse(antwort.wert);
  if (!erfolg.success) return gescheitert('function_unavailable');
  // Ein Wert, der nicht in seiner Zeile steht, wird nicht gezeigt - auch nicht vom eigenen Gateway.
  if (!felderGetreu(erfolg.data.fundstellen)) return gescheitert('nicht_satzgetreu');
  return { ok: true, fundstellen: erfolg.data.fundstellen, quelle: erfolg.data.quelle };
}
