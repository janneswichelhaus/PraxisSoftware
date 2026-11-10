import { z } from 'zod';
import {
  ASSISTENZ_FEHLERTEXTE,
  assistenzAnfragen,
  assistenzVerfuegbar,
  type Kifehler,
} from '@/lib/ki/gateway';

// Eine Antwort der Praxis umformen (ANN-861): je Satz genau ein Satz; wo die Prüfung des Gateways
// nicht besteht, steht die Quelle im Wortlaut. Die Seite zeigt jede Quelle neben ihrem Satz, und
// die Frage der Person geht nicht hinaus (ANN-862).

/** Stichpunkte der Praxis werden ganze Sätze. */
export const ZWECK_ENTWURF = 'nachricht.entwurf';

/** Dieselbe Aussage in verständlichen Wörtern, für die Person, die sie liest. */
export const ZWECK_ALLTAGSSPRACHE = 'nachricht.alltagssprache';

export type Umformzweck = typeof ZWECK_ENTWURF | typeof ZWECK_ALLTAGSSPRACHE;

/** So lang wie eine Antwort höchstens; der Gateway hält dieselbe Grenze. */
export const UMFORMEN_HOECHSTZEICHEN = 2000;

/** Ein Satz des Textes mit seiner Zeile - dieselbe Zerlegung wie `stuecke` im Gateway. */
export interface Stueck {
  readonly text: string;
  readonly zeile: number;
}

// Dieselbe Liste wie im Gateway (`waechter.ts`); `vertrag.test.ts` hält beide gleich.
const KEIN_SATZENDE =
  /(?:^|[\s(])(?:\d+|\p{L}|li|re|bds|tägl|tgl|evtl|ggf|ca|bzw|vgl|inkl|usw|max|mind|Dr|Nr|Min|Std|Sek|Wdh)\.$/iu;

function nachSatzzeichen(zeile: string): string[] {
  const teile: string[] = [];
  let anfang = 0;
  for (const treffer of zeile.matchAll(/[.!?…](\s+)/gu)) {
    const ende = treffer.index + treffer[0].length - treffer[1]!.length;
    teile.push(zeile.slice(anfang, ende));
    anfang = ende + treffer[1]!.length;
  }
  teile.push(zeile.slice(anfang));
  return teile;
}

/** Der Text in Sätzen, Zeile für Zeile; ein Punkt nach einer Abkürzung beendet keinen Satz. */
export function stuecke(text: string): Stueck[] {
  const liste: Stueck[] = [];
  for (const [zeile, roh] of text.split(/\r?\n/).entries()) {
    let offen = '';
    for (const teil of nachSatzzeichen(roh.trim())) {
      const satz = teil.trim();
      if (satz === '') continue;
      offen = offen === '' ? satz : `${offen} ${satz}`;
      if (KEIN_SATZENDE.test(offen)) continue;
      liste.push({ text: offen, zeile });
      offen = '';
    }
    if (offen !== '') liste.push({ text: offen, zeile });
  }
  return liste;
}

const antwortSchema = z.object({
  ok: z.literal(true),
  art: z.literal('umformen'),
  saetze: z
    .array(z.object({ text: z.string().min(1).max(8000), unveraendert: z.boolean() }))
    .max(2000),
  quelle: z.enum(['anbieter', 'nachbildung']),
});

/** Ein Satz des Vorschlags mit dem Satz der Praxis, aus dem er entstand. */
export interface Umformsatz {
  readonly quelle: string;
  readonly text: string;
  /** Hier steht der Satz der Praxis im Wortlaut. */
  readonly unveraendert: boolean;
}

export interface Umformvorschlag {
  readonly saetze: readonly Umformsatz[];
  /** Der Vorschlag als Text, mit den Zeilen und Absätzen der Eingabe. */
  readonly text: string;
  readonly quelle: 'anbieter' | 'nachbildung';
}

export type Umformergebnis =
  | { readonly ok: true; readonly vorschlag: Umformvorschlag }
  | { readonly ok: false; readonly fehler: Kifehler; readonly meldung: string };

function gescheitert(fehler: Kifehler): Umformergebnis {
  return { ok: false, fehler, meldung: ASSISTENZ_FEHLERTEXTE[fehler] };
}

/** Sätze einer Zeile mit Leerzeichen, Zeilen mit Zeilenwechsel, Absätze mit Leerzeile. */
function zusammengesetzt(quellen: readonly Stueck[], texte: readonly string[]): string {
  let text = '';
  for (const [stelle, stueck] of quellen.entries()) {
    if (stelle > 0) {
      const abstand = stueck.zeile - quellen[stelle - 1]!.zeile;
      text += abstand === 0 ? ' ' : abstand === 1 ? '\n' : '\n\n';
    }
    text += texte[stelle]!;
  }
  return text;
}

export function umformenVerfuegbar(zweck: Umformzweck, signal?: AbortSignal): Promise<boolean> {
  return assistenzVerfuegbar(zweck, signal);
}

/** Hinaus gehen die Rückfrage (Berechtigung, bleibt im Gateway) und der Text. Wirft nicht. */
export async function textUmformen({
  zweck,
  rueckfrageId,
  text,
  signal,
}: {
  zweck: Umformzweck;
  rueckfrageId: string;
  text: string;
  signal?: AbortSignal | undefined;
}): Promise<Umformergebnis> {
  if (text.trim() === '') return gescheitert('invalid_request');
  if (text.length > UMFORMEN_HOECHSTZEICHEN) return gescheitert('too_large');

  const antwort = await assistenzAnfragen(zweck, { rueckfrage: rueckfrageId, text }, signal);
  if (!antwort.ok) return gescheitert(antwort.fehler);
  const erfolg = antwortSchema.safeParse(antwort.wert);
  if (!erfolg.success) return gescheitert('function_unavailable');

  // Je Satz der Eingabe genau ein Satz, und „unverändert“ heißt wörtlich: Sonst zeigt die Seite
  // nichts - auch nicht vom eigenen Gateway.
  const quellen = stuecke(text);
  const { saetze, quelle } = erfolg.data;
  const passt =
    saetze.length === quellen.length &&
    saetze.every(
      (satz, stelle) =>
        !/[\r\n]/.test(satz.text) && (!satz.unveraendert || satz.text === quellen[stelle]!.text),
    );
  if (!passt) return gescheitert('nicht_satzgetreu');

  return {
    ok: true,
    vorschlag: {
      saetze: saetze.map((satz, stelle) => ({ ...satz, quelle: quellen[stelle]!.text })),
      text: zusammengesetzt(
        quellen,
        saetze.map((satz) => satz.text),
      ),
      quelle,
    },
  };
}
