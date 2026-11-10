import { z } from 'zod';
import { titelDerZeile } from '@/lib/ki/einheiten';
import {
  ASSISTENZ_FEHLERTEXTE,
  DIKTAT_ABSCHNITTE,
  assistenzAnfragen,
  assistenzVerfuegbar,
  type Kifehler,
} from '@/lib/ki/gateway';
import { stuecke } from '@/lib/ki/umformen';

// Verlauf in Auszügen (ANN-861): Der Anbieter nennt nur Stellen, der Gateway setzt die Sätze im
// Wortlaut. Die Seite zeigt einen Auszug nur, wenn jeder Satz so in seinem Eintrag steht - und
// nichts davon wird gespeichert (ANN-862).

/** Der Zweck in der Zweckliste des Gateways (`zwecke.ts`). */
export const ZWECK_AUSZUG = 'verlauf.auszug';

/** Die Grenzen des Gateways: Einträge je Anfrage, Sätze je Eintrag, Zeichen insgesamt. */
export const AUSZUG_HOECHST_EINTRAEGE = 12;
export const AUSZUG_HOECHST_JE_EINTRAG = 2;
export const AUSZUG_HOECHSTZEICHEN = 60_000;

/** Ein Eintrag der Dokumentation: seine Kennung und sein Wortlaut, sonst nichts. */
export interface Quelleintrag {
  readonly id: string;
  readonly text: string;
}

/** Die ausgewählten Sätze eines Eintrags, im Wortlaut und in dessen Reihenfolge. */
export interface Auszug {
  readonly id: string;
  readonly saetze: readonly string[];
}

const antwortSchema = z.object({
  ok: z.literal(true),
  art: z.literal('auszug'),
  auszuege: z
    .array(
      z.object({
        id: z.string(),
        saetze: z.array(z.string().min(1).max(20_000)).min(1).max(AUSZUG_HOECHST_JE_EINTRAG),
      }),
    )
    .max(AUSZUG_HOECHST_EINTRAEGE),
  quelle: z.enum(['anbieter', 'nachbildung']),
});

export type Auszugsergebnis =
  | {
      readonly ok: true;
      readonly auszuege: readonly Auszug[];
      readonly quelle: 'anbieter' | 'nachbildung';
    }
  | { readonly ok: false; readonly fehler: Kifehler; readonly meldung: string };

function gescheitert(fehler: Kifehler): Auszugsergebnis {
  return { ok: false, fehler, meldung: ASSISTENZ_FEHLERTEXTE[fehler] };
}

/**
 * Die Sätze eines Eintrags - dieselbe Zerlegung wie `auszugssaetze` im Gateway (`auszug.ts`);
 * `vertrag.test.ts` hält beide gleich. Ein Titel der Vorlage ist Gliederung und kein Satz.
 */
export function auszugssaetze(text: string, vorlage: readonly string[]): string[] {
  const zeilen = text
    .split(/\r?\n/)
    .filter((zeile) => titelDerZeile(zeile.trim(), vorlage) === null);
  return stuecke(zeilen.join('\n')).map((stueck) => stueck.text);
}

/** Stehen die Sätze in dieser Reihenfolge im Eintrag, jeder an einer eigenen Stelle? */
function inReihenfolgeEnthalten(saetze: readonly string[], quelle: readonly string[]): boolean {
  let stelle = 0;
  for (const satz of saetze) {
    const fund = quelle.indexOf(satz, stelle);
    if (fund === -1) return false;
    stelle = fund + 1;
  }
  return true;
}

/**
 * Jeder Auszug gehört zu einem gesendeten Eintrag, keiner doppelt, in der gesendeten
 * Reihenfolge - und jeder Satz steht wörtlich in seinem Eintrag.
 */
export function auszugGetreu(
  eintraege: readonly Quelleintrag[],
  auszuege: readonly Auszug[],
): boolean {
  let ab = 0;
  for (const auszug of auszuege) {
    const stelle = eintraege.findIndex(
      (eintrag, nummer) => nummer >= ab && eintrag.id === auszug.id,
    );
    if (stelle === -1) return false;
    ab = stelle + 1;
    const quelle = auszugssaetze(eintraege[stelle]!.text, DIKTAT_ABSCHNITTE);
    if (auszug.saetze.length === 0 || auszug.saetze.length > AUSZUG_HOECHST_JE_EINTRAG)
      return false;
    if (!inReihenfolgeEnthalten(auszug.saetze, quelle)) return false;
  }
  return true;
}

/** So viele Einträge, wie in eine Anfrage passen - von vorn, ohne einen zu kürzen. */
export function passendeEintraege(eintraege: readonly Quelleintrag[]): Quelleintrag[] {
  const liste: Quelleintrag[] = [];
  let zeichen = 0;
  for (const eintrag of eintraege) {
    if (eintrag.text.trim() === '') continue;
    if (liste.length === AUSZUG_HOECHST_EINTRAEGE) break;
    if (zeichen + eintrag.text.length > AUSZUG_HOECHSTZEICHEN) break;
    zeichen += eintrag.text.length;
    liste.push({ id: eintrag.id, text: eintrag.text });
  }
  return liste;
}

export function auszugVerfuegbar(signal?: AbortSignal): Promise<boolean> {
  return assistenzVerfuegbar(ZWECK_AUSZUG, signal);
}

/**
 * Hinaus gehen die Akte (Berechtigung, bleibt im Gateway) und je Eintrag Kennung und Wortlaut -
 * kein Datum, keine Verfasser:in. Wirft nicht.
 */
export async function auszuegeAnfragen({
  akteId,
  eintraege,
  signal,
}: {
  akteId: string;
  eintraege: readonly Quelleintrag[];
  signal?: AbortSignal | undefined;
}): Promise<Auszugsergebnis> {
  const gesendet = passendeEintraege(eintraege);
  if (gesendet.length === 0) return gescheitert('invalid_request');

  const antwort = await assistenzAnfragen(
    ZWECK_AUSZUG,
    { akte: akteId, eintraege: gesendet },
    signal,
  );
  if (!antwort.ok) return gescheitert(antwort.fehler);
  const erfolg = antwortSchema.safeParse(antwort.wert);
  if (!erfolg.success) return gescheitert('function_unavailable');
  // Ein Satz, der in keinem Eintrag steht, wird nicht gezeigt - auch nicht vom eigenen Gateway.
  if (!auszugGetreu(gesendet, erfolg.data.auszuege)) return gescheitert('nicht_satzgetreu');
  return { ok: true, auszuege: erfolg.data.auszuege, quelle: erfolg.data.quelle };
}
