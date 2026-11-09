import { z } from 'zod';
import { einheiten, gleicheSaetze } from '@/lib/ki/einheiten';
import {
  ASSISTENZ_FEHLERTEXTE,
  DIKTAT_ABSCHNITTE,
  assistenzAnfragen,
  assistenzVerfuegbar,
  vorschlagAlsText,
  type Kifehler,
} from '@/lib/ki/gateway';

// Getippte Notizen in die Abschnitte der Vorlage ordnen. ANN-861: Der Anbieter ordnet nur Sätze
// zu, den Text setzt der Gateway wörtlich zusammen, und die Seite zeigt nur einen Vorschlag,
// in dem genau die Sätze des Textes stehen. Der Eintrag trägt dafür kein Merkmal (ANN-862).

/** Der Zweck in der Zweckliste des Gateways (`zwecke.ts`). */
export const ZWECK_ORDNEN = 'dokumentation.ordnen';

/** So lang wie ein Eintrag höchstens; der Gateway hält dieselbe Grenze. */
export const ORDNEN_HOECHSTZEICHEN = 20_000;

const antwortSchema = z.object({
  ok: z.literal(true),
  art: z.literal('ordnen'),
  abschnitte: z
    .array(z.object({ titel: z.enum(DIKTAT_ABSCHNITTE), text: z.string().max(50_000) }))
    .max(DIKTAT_ABSCHNITTE.length),
  quelle: z.enum(['anbieter', 'nachbildung']),
});

/** Der geordnete Text, seine Abschnitte zum Lesen und woher er stammt. */
export interface Ordnungsvorschlag {
  readonly text: string;
  readonly abschnitte: readonly { readonly titel: string; readonly text: string }[];
  readonly quelle: 'anbieter' | 'nachbildung';
}

export type Ordnungsergebnis =
  | { readonly ok: true; readonly vorschlag: Ordnungsvorschlag }
  | { readonly ok: false; readonly fehler: Kifehler; readonly meldung: string };

function gescheitert(fehler: Kifehler): Ordnungsergebnis {
  return { ok: false, fehler, meldung: ASSISTENZ_FEHLERTEXTE[fehler] };
}

/** Stehen in den Abschnitten genau die Sätze des Textes, jeder so oft wie dort? */
export function geordnetGetreu(text: string, abschnitte: readonly { text: string }[]): boolean {
  return gleicheSaetze(
    einheiten(text, DIKTAT_ABSCHNITTE).map((einheit) => einheit.text),
    abschnitte.flatMap((abschnitt) => einheiten(abschnitt.text, []).map((e) => e.text)),
  );
}

export function ordnenVerfuegbar(signal?: AbortSignal): Promise<boolean> {
  return assistenzVerfuegbar(ZWECK_ORDNEN, signal);
}

/** Hinaus gehen der Termin (Berechtigung, bleibt im Gateway) und der Text. Wirft nicht. */
export async function textOrdnen({
  terminId,
  text,
  signal,
}: {
  terminId: string;
  text: string;
  signal?: AbortSignal | undefined;
}): Promise<Ordnungsergebnis> {
  if (text.trim() === '') return gescheitert('invalid_request');
  if (text.length > ORDNEN_HOECHSTZEICHEN) return gescheitert('too_large');

  const antwort = await assistenzAnfragen(ZWECK_ORDNEN, { termin: terminId, text }, signal);
  if (!antwort.ok) return gescheitert(antwort.fehler);
  const erfolg = antwortSchema.safeParse(antwort.wert);
  if (!erfolg.success) return gescheitert('function_unavailable');
  // Was ergänzt, weglässt oder ändert, zeigt die Seite nicht - auch nicht vom eigenen Gateway.
  if (!geordnetGetreu(text, erfolg.data.abschnitte)) return gescheitert('nicht_satzgetreu');
  const { abschnitte, quelle } = erfolg.data;
  return { ok: true, vorschlag: { text: vorschlagAlsText(erfolg.data), abschnitte, quelle } };
}
