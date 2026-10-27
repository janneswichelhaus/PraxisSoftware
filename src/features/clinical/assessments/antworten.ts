import { z } from 'zod';
import {
  MAX_MARKIERUNGEN,
  bereicheText,
  istKoerperbereich,
  type Markierung,
} from './koerperschema';
import { optionKennung, type ScoreDefinition, type ScoreItem } from './schema';

/**
 * Die Antworten einer Erhebung (FRB-EPIC-002).
 *
 * Gespeichert wird ein Objekt „Kennung des Items → Antwort". Die Form der
 * Antwort folgt allein dem Typ des Items — wie bei der Definition kennt der
 * Code kein Instrument namentlich. Der Server kennt die Definitionen nicht und
 * prüft nur, dass jede Antwort ein Objekt ist (**ANN-105**); was eine gültige
 * Antwort auf *dieses* Item ist, prüft `antwortenSchema` hier, vor dem
 * Speichern.
 *
 * Eine Frage ohne Antwort fehlt im Objekt. „Nicht beantwortet" und „nein"
 * sind zweierlei, und nur das zweite hat die Person gesagt.
 */

/** Höchstlänge einer freien Angabe — ein Absatz, kein Brief. */
export const FREITEXT_MAX = 2000;

export type Antwort =
  | { auswahl: string; freitext?: string }
  | { auswahl: string[]; freitext?: string }
  | { wert: number }
  | { text: string }
  | { markierungen: Markierung[] };

export type Antworten = Record<string, Antwort>;

/** Die Meldung, wenn mehr Stellen markiert sind, als eine Angabe tragen soll (ANN-107). */
export const ZU_VIELE_STELLEN = `Höchstens ${MAX_MARKIERUNGEN} Stellen – bitte eine entfernen.`;

const AUSSERHALB_DER_FIGUR =
  'Eine Stelle liegt außerhalb der Figur. Bitte entfernen und neu setzen.';

const freitextSchema = z.string().trim().min(1).max(FREITEXT_MAX);

function optionMitFreitext(item: ScoreItem, gewaehlt: readonly string[]): boolean {
  return (item.optionen ?? []).some(
    (option) => option.freitext === true && gewaehlt.includes(optionKennung(option)),
  );
}

/**
 * Das Schema einer Antwort auf genau dieses Item.
 *
 * Die Meldungen der eigenen Regeln sind deutsch und sagen, was zu tun ist:
 * Sie stehen an der Frage (BEF-03). Was Zod selbst meldet, erscheint nie -
 * `antwortFehler` setzt dafür einen festen Satz je Typ.
 */
export function antwortSchema(item: ScoreItem): z.ZodType {
  const kennungen = (item.optionen ?? []).map(optionKennung);
  const bekannt = z
    .string()
    .refine(
      (wert) => kennungen.includes(wert),
      'Diese Auswahl gehört nicht zur Frage. Bitte die Antwort entfernen und neu wählen.',
    );

  switch (item.typ) {
    case 'einzelauswahl':
      return z
        .object({ auswahl: bekannt, freitext: freitextSchema.optional() })
        .strict()
        .refine(
          (a) => a.freitext === undefined || optionMitFreitext(item, [a.auswahl]),
          'Eine eigene Angabe gehört zu einer Option, die sie vorsieht.',
        );
    case 'mehrfachauswahl':
      return z
        .object({ auswahl: z.array(bekannt).min(1), freitext: freitextSchema.optional() })
        .strict()
        .refine(
          (a) => new Set(a.auswahl).size === a.auswahl.length,
          'Eine Option ist doppelt gewählt. Bitte das Kreuz entfernen und neu setzen.',
        )
        .refine((a) => {
          // „nein" steht allein: Wer es zusammen mit „Nachtschmerzen" wählt,
          // hat sich verklickt — gespeichert wird so etwas nicht.
          const exklusiv = (item.optionen ?? [])
            .filter((option) => option.exklusiv)
            .map(optionKennung);
          return !a.auswahl.some((wert) => exklusiv.includes(wert)) || a.auswahl.length === 1;
        }, '„nein“ lässt sich nicht mit einer anderen Angabe verbinden.')
        .refine(
          (a) => a.freitext === undefined || optionMitFreitext(item, a.auswahl),
          'Eine eigene Angabe gehört zu einer Option, die sie vorsieht.',
        );
    case 'skala': {
      const skala = item.skala ?? { min: 0, max: 0 };
      return z.object({ wert: z.number().int().min(skala.min).max(skala.max) }).strict();
    }
    case 'zahl':
      return z.object({ wert: z.number().finite() }).strict();
    case 'freitext':
      return z.object({ text: freitextSchema }).strict();
    case 'koerperschema':
      // Stelle relativ zum Bild und ihr Bereich (ANN-107). Mehr als 30 Kreise
      // wären keine Angabe mehr, sondern ein ausgemaltes Bild.
      return z
        .object({
          markierungen: z
            .array(
              z
                .object({
                  x: z.number().min(0).max(1),
                  y: z.number().min(0).max(1),
                  bereich: z.string().refine(istKoerperbereich, AUSSERHALB_DER_FIGUR),
                })
                .strict(),
            )
            .min(1)
            .max(MAX_MARKIERUNGEN, ZU_VIELE_STELLEN),
        })
        .strict();
  }
}

/**
 * Das Schema aller Antworten auf eine Definition. Eine Antwort auf ein Item,
 * das es nicht gibt, wird abgewiesen — sie wäre im Verlauf unauffindbar.
 */
export function antwortenSchema(definition: ScoreDefinition): z.ZodType<Antworten> {
  const felder = Object.fromEntries(
    definition.items.map((item) => [item.id, antwortSchema(item).optional()]),
  );
  return z.object(felder).strict() as unknown as z.ZodType<Antworten>;
}

/** Eine beanstandete Antwort: an welcher Frage, und was zu tun ist. */
export interface Antwortfehler {
  itemId: string;
  meldung: string;
}

/**
 * Was an einer Antwort nicht stimmt, in Worten der Praxis (BEF-03).
 *
 * Die eigenen Regeln oben tragen ihre Meldung selbst. Alles, was Zod sonst
 * meldet - „Too big: expected array to have <=30 items" -, kommt hier nicht
 * durch: Dafür steht ein fester Satz je Typ.
 */
function meldungFuer(item: ScoreItem, fehler: z.ZodError): string {
  const erste = fehler.issues[0];
  if (erste && (erste.code === 'custom' || erste.message === ZU_VIELE_STELLEN)) {
    return erste.message;
  }
  switch (item.typ) {
    case 'einzelauswahl':
    case 'mehrfachauswahl':
      return 'Diese Auswahl passt nicht zur Frage. Bitte die Antwort entfernen und neu wählen.';
    case 'skala': {
      const skala = item.skala ?? { min: 0, max: 0 };
      return `Bitte einen Wert von ${skala.min} bis ${skala.max} wählen.`;
    }
    case 'zahl':
      return 'Bitte eine Zahl eingeben.';
    case 'freitext':
      return `Bitte höchstens ${FREITEXT_MAX} Zeichen eingeben.`;
    case 'koerperschema':
      return AUSSERHALB_DER_FIGUR;
  }
}

/**
 * Alle beanstandeten Antworten eines Bogens, in der Reihenfolge der Fragen.
 *
 * Dieselben Schemata wie `antwortenSchema`, aber je Frage geprüft: So steht
 * der Fehler an der Frage und in der Fehlerzusammenfassung, statt als ein
 * Satz unter einem Bogen von zehn Bildschirmhöhen (BEF-03).
 */
export function antwortFehler(definition: ScoreDefinition, antworten: Antworten): Antwortfehler[] {
  const fehler: Antwortfehler[] = [];
  for (const item of definition.items) {
    const antwort = antworten[item.id];
    if (antwort === undefined) continue;
    const ergebnis = antwortSchema(item).safeParse(antwort);
    if (!ergebnis.success) {
      fehler.push({ itemId: item.id, meldung: meldungFuer(item, ergebnis.error) });
    }
  }
  const bekannt = new Set(definition.items.map((item) => item.id));
  for (const itemId of Object.keys(antworten)) {
    if (!bekannt.has(itemId)) {
      fehler.push({
        itemId,
        meldung:
          'Der Bogen enthält eine Antwort auf eine Frage, die es in dieser Fassung nicht gibt.',
      });
    }
  }
  return fehler;
}

/**
 * Die Antwort in Worten, **wörtlich aus der Definition**: die Beschriftung der
 * Option, der Wert der Skala, der Text der Person. Keine Deutung, keine
 * Zusammenfassung (ADR-006 Punkt 3 und 11). `null` heißt: nicht beantwortet.
 */
export function antwortText(item: ScoreItem, antwort: Antwort | undefined): string | null {
  if (antwort === undefined) return null;
  const label = (kennung: string) =>
    (item.optionen ?? []).find((option) => optionKennung(option) === kennung)?.label ?? kennung;
  const eigene = 'freitext' in antwort && antwort.freitext ? ` („${antwort.freitext}“)` : '';

  if ('auswahl' in antwort) {
    const gewaehlt = Array.isArray(antwort.auswahl) ? antwort.auswahl : [antwort.auswahl];
    return gewaehlt.map(label).join(', ') + eigene;
  }
  if ('wert' in antwort) {
    return item.skala ? `${antwort.wert} von ${item.skala.max}` : String(antwort.wert);
  }
  if ('text' in antwort) return antwort.text;
  return bereicheText(antwort.markierungen.map((m) => m.bereich));
}

/** Die gewählten Kennungen einer Auswahl, sonst leer. */
export function gewaehlteKennungen(antwort: Antwort | undefined): string[] {
  if (antwort === undefined || !('auswahl' in antwort)) return [];
  return Array.isArray(antwort.auswahl) ? antwort.auswahl : [antwort.auswahl];
}
